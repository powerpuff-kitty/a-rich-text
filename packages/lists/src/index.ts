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
  const blockIndex = selection.anchor.blockPath[active.path.length + 1]!;
  const block = item.content[blockIndex];
  if (selection.anchor.blockPath.length !== active.path.length + 2 || !isInlineBlock(block)) return null;

  if (item.content.length === 1 && (block.content ?? []).every((run) => run.type === 'text' && run.text.length === 0)) {
    return exitEmptyItem(state, active);
  }

  // Use normal text deletion/split operations first so annotation offsets map
  // through the split before the resulting paragraphs move into sibling items.
  const split = insertParagraph(state)!;
  const intermediate = applyTransaction(state, split).state;
  const splitList = getNodeAtPath(intermediate.document, active.path) as ARTListNode;
  const next = cloneList(splitList);
  const splitItem = next.content[active.itemIndex]!;
  const right = splitItem.content.splice(blockIndex + 1);
  next.content.splice(active.itemIndex + 1, 0, {
    type: 'listItem',
    ...(next.style === 'task' ? { checked: false } : {}),
    content: right,
  });

  const mappings: ARTPathMapping[] = [];
  splitList.content.forEach((current, itemIndex) => {
    current.content.forEach((child, childIndex) => {
      const targetItem = itemIndex > active.itemIndex ? itemIndex + 1 : itemIndex;
      const movedRight = itemIndex === active.itemIndex && childIndex > blockIndex;
      collectPreservedMappings(child,
        [...active.path, itemIndex, childIndex],
        [...active.path, movedRight ? itemIndex + 1 : targetItem, movedRight ? childIndex - blockIndex - 1 : childIndex],
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

/** Move the current item under its preceding sibling. */
export function indentListItem(state: EditorState): EditorTransaction | null {
  const selection = state.selection;
  if (!selection || !samePath(selection.anchor.blockPath, selection.head.blockPath)) return null;
  const active = findNearestList(state.document, selection.anchor.blockPath);
  if (!active || active.itemIndex < 1) return null;
  const next = cloneList(active.node);
  const [item] = next.content.splice(active.itemIndex, 1);
  const previous = next.content[active.itemIndex - 1]!;
  const nestedIndex = previous.content.length;
  previous.content.push({ type: 'list', style: next.style, content: [item!] });
  const mappings: ARTPathMapping[] = [];
  active.node.content.forEach((child, index) => {
    const target = index === active.itemIndex
      ? [...active.path, index - 1, nestedIndex, 0]
      : [...active.path, index > active.itemIndex ? index - 1 : index];
    collectPreservedMappings(child, [...active.path, index], target, mappings);
  });
  return transaction().replaceBlock(active.path, [next], mappings)
    .setSelection(mapSelection(selection, mappings)).setMeta('command', 'indentListItem').build();
}

/** Lift an item one nesting level, or into ordinary blocks at the outer level. */
export function outdentListItem(state: EditorState): EditorTransaction | null {
  const selection = state.selection;
  if (!selection || !samePath(selection.anchor.blockPath, selection.head.blockPath)) return null;
  const active = findNearestList(state.document, selection.anchor.blockPath);
  if (!active || active.itemIndex < 0) return null;
  const outerPath = active.path.slice(0, -2);
  const outer = getNodeAtPath(state.document, outerPath);
  if (!isList(outer)) return exitEmptyItem(state, active);
  const parentIndex = active.path.at(-2)!;
  const nestedIndex = active.path.at(-1)!;
  const next = cloneList(outer);
  const parent = next.content[parentIndex]!;
  const nested = parent.content[nestedIndex] as ARTListNode;
  const [lifted] = nested.content.splice(active.itemIndex, 1);
  // Trailing siblings remain below the lifted item, preserving their order.
  const trailing = nested.content.splice(active.itemIndex);
  const trailingIndex = lifted!.content.length;
  if (trailing.length) lifted!.content.push({ type: 'list', style: nested.style, content: trailing });
  const removedNested = nested.content.length === 0;
  if (removedNested) parent.content.splice(nestedIndex, 1);
  if (outer.style === 'task') lifted!.checked ??= false;
  else delete lifted!.checked;
  next.content.splice(parentIndex + 1, 0, lifted!);
  const mappings: ARTPathMapping[] = [];
  collectPreservedMappings(outer, outerPath, outerPath, mappings);
  for (const mapping of mappings) {
    const relative = mapping.from.slice(outerPath.length);
    const [itemIndex, childIndex, nestedItem] = relative;
    if (itemIndex === parentIndex && childIndex === nestedIndex) {
      if (nestedItem === active.itemIndex) mapping.to = [...outerPath, parentIndex + 1, ...relative.slice(3)];
      else if (nestedItem! > active.itemIndex) mapping.to = [...outerPath, parentIndex + 1, trailingIndex, nestedItem! - active.itemIndex - 1, ...relative.slice(3)];
    } else if (itemIndex! > parentIndex) mapping.to = [...outerPath, itemIndex! + 1, ...relative.slice(1)];
    else if (itemIndex === parentIndex && childIndex! > nestedIndex && removedNested) mapping.to = [...outerPath, parentIndex, childIndex! - 1, ...relative.slice(2)];
  }
  return transaction().replaceBlock(outerPath, [next], mappings)
    .setSelection(mapSelection(selection, mappings)).setMeta('command', 'outdentListItem').build();
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
  active.node.content[active.itemIndex]!.content.forEach((child, index) => {
    replacement.push(cloneValue(child));
    collectPreservedMappings(child, [...active.path, active.itemIndex, index],
      [...paragraphPath.slice(0, -1), paragraphPath.at(-1)! + index], mappings);
  });
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
