import type { ARTHeadingNode, ARTTextMark } from '@arichtext/core';
import { transaction } from './transaction.js';
import type { EditorState, EditorTransaction } from './types.js';

/** Replace the current selection, or insert at a collapsed caret. */
export function insertText(
  state: EditorState,
  text: string,
  marks?: ARTTextMark[],
): EditorTransaction | null {
  const selection = state.selection;
  if (!selection) return null;
  return transaction()
    .replaceText(selection.anchor, selection.head, text, marks)
    .setMeta('command', 'insertText')
    .build();
}

/** Delete the current selection. Collapsed selections are a no-op. */
export function deleteSelection(state: EditorState): EditorTransaction | null {
  const selection = state.selection;
  if (!selection) return null;
  if (
    selection.anchor.offset === selection.head.offset
    && selection.anchor.blockPath.length === selection.head.blockPath.length
    && selection.anchor.blockPath.every((value, index) => value === selection.head.blockPath[index])
  ) {
    return null;
  }
  return transaction()
    .replaceText(selection.anchor, selection.head, '')
    .setMeta('command', 'deleteSelection')
    .build();
}

/** Toggle an inline mark across the current selection. */
export function toggleSelectionMark(
  state: EditorState,
  mark: ARTTextMark,
): EditorTransaction | null {
  const selection = state.selection;
  if (!selection) return null;
  return transaction()
    .toggleMark(selection.anchor, selection.head, mark)
    .setMeta('command', `toggleMark:${mark.type}`)
    .build();
}

/** Add an inline mark across the current selection. */
export function addSelectionMark(
  state: EditorState,
  mark: ARTTextMark,
): EditorTransaction | null {
  const selection = state.selection;
  if (!selection) return null;
  return transaction()
    .addMark(selection.anchor, selection.head, mark)
    .setMeta('command', `addMark:${mark.type}`)
    .build();
}

/** Change the block containing the selection anchor to paragraph. */
export function setCurrentParagraph(state: EditorState): EditorTransaction | null {
  const selection = state.selection;
  if (!selection) return null;
  return transaction()
    .setBlockType(selection.anchor.blockPath, 'paragraph')
    .setMeta('command', 'setParagraph')
    .build();
}

/** Change the block containing the selection anchor to a heading. */
export function setCurrentHeading(
  state: EditorState,
  level: ARTHeadingNode['level'],
): EditorTransaction | null {
  const selection = state.selection;
  if (!selection) return null;
  return transaction()
    .setBlockType(selection.anchor.blockPath, 'heading', level)
    .setMeta('command', `setHeading:${level}`)
    .build();
}
