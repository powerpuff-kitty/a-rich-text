import type {
  ARTBlockNode,
  ARTDocument,
  ARTListNode,
  ARTParagraphNode,
} from '@arichtext/core';
import {
  applyTransaction,
  transaction,
  type ARTPath,
  type ARTPathMapping,
  type ARTSelection,
  type EditorState,
  type EditorTransaction,
} from '@arichtext/engine';
import { insertParagraph } from '@arichtext/engine/commands';

export type ListStyle = ARTListNode['style'];

export interface ActiveList {
  path: number[];
  style: ListStyle;
  itemIndex: number;
}

/** Return the closest list containing the selection anchor. */
export function getActiveList(state: EditorState): ActiveList | null {
  const selection = state.selection;
  if (!selection) return null;
  const found = findNearestList(state.document, selection.anchor.blockPath);
  return found
    ? { path: [...found.path], style: found.node.style, itemIndex: found.itemIndex }
    : null;
}

/**
 * Toggle the requested list style for the current single text block.
 *
 * - outside a list: wrap paragraph/heading in a one-item list;
 * - inside a different list style: convert the closest list in place;
 * - inside the same list style: unwrap all top-level list-item blocks.
 */
export function toggleList(state: EditorState, style: ListStyle): EditorTransaction | null {
  const selection = state.selection;
  if (!selection || !samePath(selection.anchor.blockPath, selection.head.blockPath)) return null;

  const active = findNearestList(state.document, selection.anchor.blockPath);
  if (!active) return wrapCurrentBlock(state, style);
  if (active.node.style !== style) return replaceListStyle(state, active, style);
  return unwrapList(state, active);
}

/** Convert the closest current list to a specific style without unwrapping it. */
export function setListStyle(state: EditorState, style: ListStyle): EditorTransaction | null {
  const selection = state.selection;
  if (!selection || !samePath(selection.anchor.blockPath, selection.head.blockPath)) return null;
  const active = findNearestList(state.document, selection.anchor.blockPath);
  if (!active) return null;
  if (active.node.style === style) return null;
  return replaceListStyle(state, active, style);
}

/** Update the checked state of the current top-level task-list item. */
export function setTaskItemChecked(
  state: EditorState,
  checked: boolean,
): EditorTransaction | null {
  const selection = state.selection;
  if (!selection || !samePath(selection.anchor.blockPath, selection.head.blockPath)) return null;
  const active = findNearestList(state.document, selection.anchor.blockPath);
  if (!active || active.node.style !== 'task' || active.itemIndex < 0) return null;

  const next = cloneList(active.node);
  const item = next.content[active.itemIndex];
  if (!item || item.checked === checked) return null;
  item.checked = checked;

  const mappings = preservedMappings(active.node, active.path, active.path);
  return transaction()
    .replaceBlock(active.path, [next], mappings)
    .setSelection(mapSelection(selection, mappings))
    .setMeta('command', `setTaskItemChecked:${String(checked)}`)
    .build();
}

/** Split a simple list item, or exit an empty item into its parent container. */
export function insertListParagraph(state: EditorState): EditorTransaction | null {
  const selection = state.selection;
  if (!selection || !samePath(selection.anchor.blockPath, selection.head.blockPath)) return null;
  const active = findNearestList(state.document, selection.anchor.blockPath);
  if (!active || active.itemIndex < 0) return null;
  const item = active.node.content[active.itemIndex]!;
  const block = item.content[0];
  // Multi-block items need a separate policy for moving nested/trailing content.
  if (item.content.length !== 1 || !isInlineBlock(block)) return null;

  if ((block.content ?? []).every((run) => run.text.length === 0)) {
    return exitEmptyItem(state, active);
  }

  // Use normal text deletion/split operations first so annotation offsets map
  // through the split before the resulting paragraphs move into sibling items.
  const split = insertParagraph(state)!;
  const intermediate = applyTransaction(state, split).state;
  const splitList = getNodeAtPath(intermediate.document, active.path) as ARTListNode;
  const next = cloneList(splitList);
  const splitItem = next.content[active.itemIndex]!;
  const right = splitItem.content.splice(1);
  next.content.splice(active.itemIndex + 1, 0, {
    type: 'listItem',
    ...(next.style === 'task' ? { checked: false } : {}),
    content: right,
  });

  const mappings: ARTPathMapping[] = [];
  splitList.content.forEach((current, itemIndex) => {
    current.content.forEach((child, childIndex) => {
      const targetItem = itemIndex > active.itemIndex ? itemIndex + 1 : itemIndex;
      const movedRight = itemIndex === active.itemIndex && childIndex === 1;
      collectPreservedMappings(child,
        [...active.path, itemIndex, childIndex],
        [...active.path, movedRight ? itemIndex + 1 : targetItem, movedRight ? 0 : childIndex],
        mappings);
    });
  });
  const replacement = transaction().replaceBlock(active.path, [next], mappings).build();
  return {
    operations: [...split.operations, ...replacement.operations],
    selection: mapSelection(intermediate.selection!, mappings),
    meta: { command: 'insertListParagraph:split' },
  };
}

function exitEmptyItem(state: EditorState, active: ListLocation): EditorTransaction {
  const parentPath = active.path.slice(0, -1);
  const listIndex = active.path.at(-1)!;
  const replacement: ARTBlockNode[] = [];
  const mappings: ARTPathMapping[] = [];
  const appendList = (start: number, end: number): void => {
    if (start === end) return;
    const next = cloneList(active.node);
    next.content = next.content.slice(start, end);
    if (next.style === 'ordered') next.start = (active.node.start ?? 1) + start;
    const targetPath = [...parentPath, listIndex + replacement.length];
    replacement.push(next);
    for (let index = start; index < end; index += 1) {
      collectPreservedMappings(active.node.content[index],
        [...active.path, index], [...targetPath, index - start], mappings);
    }
  };
  appendList(0, active.itemIndex);
  const paragraphPath = [...parentPath, listIndex + replacement.length];
  replacement.push({ type: 'paragraph', content: [] });
  mappings.push({ from: [...active.path, active.itemIndex, 0], to: paragraphPath });
  appendList(active.itemIndex + 1, active.node.content.length);
  return transaction()
    .replaceBlock(active.path, replacement, mappings)
    .setSelection(mapSelection(state.selection!, mappings))
    .setMeta('command', 'insertListParagraph:exit')
    .build();
}

function wrapCurrentBlock(state: EditorState, style: ListStyle): EditorTransaction | null {
  const selection = state.selection!;
  const path = selection.anchor.blockPath;
  const node = getNodeAtPath(state.document, path);
  if (!isInlineBlock(node)) return null;

  const paragraph: ARTParagraphNode = {
    type: 'paragraph',
    content: cloneValue(node.content ?? []),
  };
  const list: ARTListNode = {
    type: 'list',
    style,
    content: [{
      type: 'listItem',
      ...(style === 'task' ? { checked: false } : {}),
      content: [paragraph],
    }],
  };
  const mappedPath = [...path, 0, 0];
  const mappings: ARTPathMapping[] = [{ from: [...path], to: mappedPath }];

  return transaction()
    .replaceBlock(path, [list], mappings)
    .setSelection(remapSelectionPath(selection, path, mappedPath))
    .setMeta('command', `toggleList:${style}:wrap`)
    .build();
}

function replaceListStyle(
  state: EditorState,
  active: ListLocation,
  style: ListStyle,
): EditorTransaction {
  const next: ARTListNode = {
    type: 'list',
    style,
    ...(style === 'ordered' && active.node.style === 'ordered' && active.node.start !== undefined
      ? { start: active.node.start }
      : {}),
    content: active.node.content.map((item) => ({
      type: 'listItem',
      ...(style === 'task' ? { checked: item.checked ?? false } : {}),
      content: cloneValue(item.content),
    })),
  };
  const mappings = preservedMappings(active.node, active.path, active.path);

  return transaction()
    .replaceBlock(active.path, [next], mappings)
    .setSelection(mapSelection(state.selection!, mappings))
    .setMeta('command', `setListStyle:${style}`)
    .build();
}

function unwrapList(state: EditorState, active: ListLocation): EditorTransaction | null {
  const parentPath = active.path.slice(0, -1);
  const listIndex = active.path.at(-1)!;
  const replacement: ARTBlockNode[] = [];
  const mappings: ARTPathMapping[] = [];

  for (let itemIndex = 0; itemIndex < active.node.content.length; itemIndex += 1) {
    const item = active.node.content[itemIndex]!;
    for (let childIndex = 0; childIndex < item.content.length; childIndex += 1) {
      const child = item.content[childIndex]!;
      const replacementIndex = replacement.length;
      replacement.push(cloneValue(child));
      collectPreservedMappings(
        child,
        [...active.path, itemIndex, childIndex],
        [...parentPath, listIndex + replacementIndex],
        mappings,
      );
    }
  }

  if (replacement.length === 0) return null;
  const mappedSelection = mapSelection(state.selection!, mappings);
  return transaction()
    .replaceBlock(active.path, replacement, mappings)
    .setSelection(mappedSelection)
    .setMeta('command', `toggleList:${active.node.style}:unwrap`)
    .build();
}

interface ListLocation {
  path: number[];
  node: ARTListNode;
  itemIndex: number;
}

function findNearestList(document: ARTDocument, blockPath: ARTPath): ListLocation | null {
  let current: unknown = document;
  const currentPath: number[] = [];
  let active: ListLocation | null = null;

  for (const index of blockPath) {
    const content = getContent(current);
    if (!content || index < 0 || index >= content.length) return null;
    current = content[index];
    currentPath.push(index);

    if (isList(current)) {
      active = { path: [...currentPath], node: current, itemIndex: -1 };
      continue;
    }
    if (
      active
      && isRecord(current)
      && current.type === 'listItem'
      && currentPath.length === active.path.length + 1
      && samePath(currentPath.slice(0, -1), active.path)
    ) {
      active.itemIndex = index;
    }
  }
  return active;
}

function preservedMappings(node: unknown, from: ARTPath, to: ARTPath): ARTPathMapping[] {
  const output: ARTPathMapping[] = [];
  collectPreservedMappings(node, from, to, output);
  return output;
}

function collectPreservedMappings(
  node: unknown,
  from: ARTPath,
  to: ARTPath,
  output: ARTPathMapping[],
): void {
  if (isInlineBlock(node)) {
    output.push({ from: [...from], to: [...to] });
    return;
  }
  const content = getContent(node);
  if (!content) return;
  for (let index = 0; index < content.length; index += 1) {
    collectPreservedMappings(content[index], [...from, index], [...to, index], output);
  }
}

function mapSelection(selection: ARTSelection, mappings: readonly ARTPathMapping[]): ARTSelection {
  return {
    anchor: mapPoint(selection.anchor, mappings),
    head: mapPoint(selection.head, mappings),
  };
}

function mapPoint(
  point: ARTSelection['anchor'],
  mappings: readonly ARTPathMapping[],
): ARTSelection['anchor'] {
  const mapping = mappings.find((candidate) => samePath(candidate.from, point.blockPath));
  if (!mapping) {
    throw new RangeError(`List transform cannot preserve selection path [${point.blockPath.join(',')}]`);
  }
  return { blockPath: [...mapping.to], offset: point.offset };
}

function remapSelectionPath(
  selection: ARTSelection,
  from: ARTPath,
  to: ARTPath,
): ARTSelection {
  const remap = (point: ARTSelection['anchor']) => {
    if (!samePath(point.blockPath, from)) {
      throw new RangeError('List wrapping requires a single text-block selection');
    }
    return { blockPath: [...to], offset: point.offset };
  };
  return { anchor: remap(selection.anchor), head: remap(selection.head) };
}

function cloneList(list: ARTListNode): ARTListNode {
  return cloneValue(list);
}

function getNodeAtPath(document: ARTDocument, path: ARTPath): unknown {
  let current: unknown = document;
  for (const index of path) {
    const content = getContent(current);
    if (!content || index < 0 || index >= content.length) return undefined;
    current = content[index];
  }
  return current;
}

function getContent(value: unknown): unknown[] | null {
  if (!isRecord(value) || !Array.isArray(value.content)) return null;
  return value.content;
}

function isList(value: unknown): value is ARTListNode {
  return isRecord(value) && value.type === 'list' && Array.isArray(value.content);
}

function isInlineBlock(value: unknown): value is Extract<ARTBlockNode, { type: 'paragraph' | 'heading' }> {
  return isRecord(value) && (value.type === 'paragraph' || value.type === 'heading');
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function samePath(left: ARTPath, right: ARTPath): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function cloneValue<T>(value: T): T {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value)) as T;
}
