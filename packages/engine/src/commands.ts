import { isExtensionInlineNode } from '@arichtext/core';
import type { ARTBlockNode, ARTExtensionInlineNode, ARTHeadingNode, ARTImageNode, ARTTextMark } from '@arichtext/core';
import { nextGraphemeBoundary, previousGraphemeBoundary } from './grapheme.js';
import { getInlineBlock, getNodeAtPath, inlineLength, listInlineBlocks, samePath, selectedStyleBlocks } from './tree.js';
import { transaction } from './transaction.js';
import type { ARTPath, EditorState, EditorTransaction } from './types.js';

/** Replace the current selection, or insert at a collapsed caret. */
export function insertText(state: EditorState, text: string, marks?: ARTTextMark[]): EditorTransaction | null {
  const selection = state.selection;
  if (!selection) return null;
  return transaction().replaceText(selection.anchor, selection.head, text, marks).setMeta('command', 'insertText').build();
}

/** Insert validated ART blocks at the current single-block selection. */
export function insertFragment(state: EditorState, content: readonly ARTBlockNode[]): EditorTransaction | null {
  const selection = state.selection;
  if (!selection || !samePath(selection.anchor.blockPath, selection.head.blockPath)) return null;
  return transaction()
    .replaceFragment(selection.anchor, selection.head, content)
    .setMeta('command', 'insertFragment')
    .build();
}

/** Insert one indivisible inline extension, replacing the current single-block selection. */
export function insertInlineNode(state: EditorState, node: ARTExtensionInlineNode): EditorTransaction | null {
  if (!isExtensionInlineNode(node)) throw new TypeError('Invalid inline extension node');
  return insertFragment(state, [{ type: 'paragraph', content: [node] }]);
}

/** Delete the current selection. Collapsed selections are a no-op. */
export function deleteSelection(state: EditorState): EditorTransaction | null {
  const selection = state.selection;
  if (!selection || isCollapsed(state)) return null;
  return transaction().replaceText(selection.anchor, selection.head, '').setMeta('command', 'deleteSelection').build();
}

/** Split the current paragraph/heading. A heading always creates a paragraph on the right. */
export function insertParagraph(state: EditorState): EditorTransaction | null {
  const selection = state.selection;
  if (!selection || !samePath(selection.anchor.blockPath, selection.head.blockPath)) return null;
  const offset = Math.min(selection.anchor.offset, selection.head.offset);
  const point = { blockPath: [...selection.anchor.blockPath], offset };
  const builder = transaction();
  if (!isCollapsed(state)) builder.replaceText(selection.anchor, selection.head, '');
  return builder.splitBlock(point).setMeta('command', 'insertParagraph').build();
}

/** Delete one grapheme before a collapsed caret, or join the previous inline sibling. */
export function deleteBackward(state: EditorState): EditorTransaction | null {
  if (!state.selection) return null;
  if (!isCollapsed(state)) return deleteSelection(state);
  const point = state.selection.anchor;
  const block = getInlineBlock(state.document, point.blockPath);
  if (point.offset > 0) {
    const text = inlineText(block);
    const from = previousGraphemeBoundary(text, point.offset);
    return transaction().replaceText({ blockPath: [...point.blockPath], offset: from }, point, '').setMeta('command', 'deleteBackward').build();
  }
  const previousPath = adjacentSiblingPath(state.document, point.blockPath, -1);
  if (!previousPath) return null;
  return transaction().joinBlocks(previousPath, point.blockPath).setMeta('command', 'deleteBackward:join').build();
}

/** Delete one grapheme after a collapsed caret, or join the next inline sibling. */
export function deleteForward(state: EditorState): EditorTransaction | null {
  if (!state.selection) return null;
  if (!isCollapsed(state)) return deleteSelection(state);
  const point = state.selection.anchor;
  const block = getInlineBlock(state.document, point.blockPath);
  const length = inlineLength(block);
  if (point.offset < length) {
    const text = inlineText(block);
    const to = nextGraphemeBoundary(text, point.offset);
    return transaction().replaceText(point, { blockPath: [...point.blockPath], offset: to }, '').setMeta('command', 'deleteForward').build();
  }
  const nextPath = adjacentSiblingPath(state.document, point.blockPath, 1);
  if (!nextPath) return null;
  return transaction().joinBlocks(point.blockPath, nextPath).setMeta('command', 'deleteForward:join').build();
}

export function toggleSelectionMark(state: EditorState, mark: ARTTextMark): EditorTransaction | null {
  const selection = state.selection;
  if (!selection) return null;
  return transaction().toggleMark(selection.anchor, selection.head, mark).setMeta('command', `toggleMark:${mark.type}`).build();
}

export function addSelectionMark(state: EditorState, mark: ARTTextMark): EditorTransaction | null {
  const selection = state.selection;
  if (!selection) return null;
  return transaction().addMark(selection.anchor, selection.head, mark).setMeta('command', `addMark:${mark.type}`).build();
}

/** Apply a block style to every selected paragraph/heading in one transaction. */
export function setCurrentParagraph(state: EditorState): EditorTransaction | null {
  return setSelectedStyle(state, 'paragraph');
}

export function setCurrentHeading(state: EditorState, level: ARTHeadingNode['level']): EditorTransaction | null {
  return setSelectedStyle(state, 'heading', level);
}

function setSelectedStyle(state: EditorState, type: 'paragraph' | 'heading', level?: ARTHeadingNode['level']): EditorTransaction | null {
  const blocks = selectedStyleBlocks(state);
  if (!blocks.length) return null;
  const command = transaction();
  for (const { path } of blocks) command.setBlockType(path, type, level);
  return command.setMeta('command', type === 'heading' ? `setHeading:${level}` : 'setParagraph').build();
}

function isCollapsed(state: EditorState): boolean {
  const selection = state.selection;
  return selection !== null && samePath(selection.anchor.blockPath, selection.head.blockPath) && selection.anchor.offset === selection.head.offset;
}

function inlineText(block: ReturnType<typeof getInlineBlock>): string {
  // A control separator forces grapheme boundaries on both sides of each atom.
  return (block.content ?? []).map(node => node.type === 'text' ? node.text : '\0').join('');
}

function adjacentSiblingPath(document: EditorState['document'], path: ARTPath, direction: -1 | 1): number[] | null {
  if (path.length === 0) return null;
  const parentPath = path.slice(0, -1);
  const currentIndex = path[path.length - 1]!;
  const siblingIndex = currentIndex + direction;
  if (siblingIndex < 0) return null;
  const parent = getNodeAtPath(document, parentPath);
  if (!parent || typeof parent !== 'object') return null;
  const content = (parent as { content?: unknown }).content;
  if (!Array.isArray(content) || siblingIndex >= content.length) return null;
  const sibling = content[siblingIndex];
  if (!sibling || typeof sibling !== 'object') return null;
  const type = (sibling as { type?: unknown }).type;
  if (type !== 'paragraph' && type !== 'heading') return null;
  return [...parentPath, siblingIndex];
}

/** Toggle the immediate quote container around a single selected text block. */
export function toggleBlockquote(state: EditorState): EditorTransaction | null {
  const selection = state.selection;
  if (!selection || !samePath(selection.anchor.blockPath, selection.head.blockPath)) return null;
  const path = selection.anchor.blockPath;
  const parentPath = path.slice(0, -1);
  const parent = getNodeAtPath(state.document, parentPath) as ARTBlockNode | undefined;
  if (parent && 'type' in parent && parent.type === 'blockquote') {
    const index = parentPath[parentPath.length - 1]!;
    const outer = parentPath.slice(0, -1);
    const mapPath = (value: readonly number[]) => [...outer, index + value[parentPath.length]!, ...value.slice(parentPath.length + 1)];
    const mappings = listInlineBlocks(state.document)
      .filter(entry => parentPath.every((value, i) => entry.path[i] === value))
      .map(entry => ({ from: entry.path, to: mapPath(entry.path) }));
    return transaction().replaceBlock(parentPath, parent.content, mappings)
      .setSelection({ anchor: { ...selection.anchor, blockPath: mapPath(path) }, head: { ...selection.head, blockPath: mapPath(path) } })
      .setMeta('command', 'toggleBlockquote:unwrap').build();
  }
  const mappedPath = [...path, 0];
  return transaction().replaceBlock(path, [{ type: 'blockquote', content: [getInlineBlock(state.document, path)] }], [{ from: path, to: mappedPath }])
    .setSelection({ anchor: { ...selection.anchor, blockPath: mappedPath }, head: { ...selection.head, blockPath: mappedPath } })
    .setMeta('command', 'toggleBlockquote:wrap').build();
}

export function insertHorizontalRule(state: EditorState): EditorTransaction | null {
  return insertFragment(state, [{ type: 'horizontalRule' }]);
}

/** Clear inline marks in one undoable transaction, preserving block structure. */
export function clearSelectionFormatting(state: EditorState): EditorTransaction | null {
  const selection = state.selection;
  if (!selection || isCollapsed(state)) return null;
  const builder = transaction();
  for (const type of ['bold', 'italic', 'underline', 'strike', 'code', 'link', 'extensionMark'] as const) {
    builder.removeMark(selection.anchor, selection.head, type);
  }
  return builder.setMeta('command', 'clearFormatting').build();
}

/** Insert a code block at a text selection, or replace an existing code block. */
export function setCodeBlock(state: EditorState, path: ARTPath | null, text: string, language = ''): EditorTransaction | null {
  const block: ARTBlockNode = { type: 'codeBlock', text, ...(language ? { language } : {}) };
  if (path === null) return insertFragment(state, [block]);
  const existing = getNodeAtPath(state.document, path) as ARTBlockNode | undefined;
  if (existing?.type !== 'codeBlock') return null;
  return transaction().replaceBlock(path, [block]).setMeta('command', 'setCodeBlock').build();
}

/** Replace a code block with a paragraph and place the caret there. */
export function removeCodeBlock(state: EditorState, path: ARTPath): EditorTransaction | null {
  const existing = getNodeAtPath(state.document, path) as ARTBlockNode | undefined;
  if (existing?.type !== 'codeBlock') return null;
  const point = { blockPath: [...path], offset: 0 };
  return transaction().replaceBlock(path, [{ type: 'paragraph' }])
    .setSelection({ anchor: point, head: point }).setMeta('command', 'removeCodeBlock').build();
}

/** Source policy matching the default HTML image converter; data URLs require explicit host conversion policy. */
export function isSafeImageSource(value: string): boolean {
  if (!value.trim()) return false;
  try { return ['http:', 'https:', 'blob:'].includes(new URL(value.trim(), 'https://arichtext.invalid').protocol); }
  catch { return false; }
}

export function setImageBlock(state: EditorState, path: ARTPath | null, image: Omit<ARTImageNode, 'type'>): EditorTransaction | null {
  if (!isSafeImageSource(image.src)) throw new TypeError('Use an HTTP(S), relative or blob image URL.');
  for (const size of [image.width, image.height]) {
    if (size !== undefined && (!Number.isSafeInteger(size) || size <= 0)) throw new TypeError('Image dimensions must be positive whole numbers.');
  }
  const block: ARTImageNode = { ...image, src: image.src.trim(), type: 'image' };
  if (path === null) return insertFragment(state, [block]);
  const existing = getNodeAtPath(state.document, path) as ARTBlockNode | undefined;
  if (existing?.type !== 'image') return null;
  return transaction().replaceBlock(path, [block]).setMeta('command', 'setImageBlock').build();
}

export function removeImageBlock(state: EditorState, path: ARTPath): EditorTransaction | null {
  const existing = getNodeAtPath(state.document, path) as ARTBlockNode | undefined;
  if (existing?.type !== 'image') return null;
  const point = { blockPath: [...path], offset: 0 };
  return transaction().replaceBlock(path, [{ type: 'paragraph' }])
    .setSelection({ anchor: point, head: point }).setMeta('command', 'removeImageBlock').build();
}
