import type { ARTDocument } from '@arichtext/core';
import type { ARTPath, ARTSelection, ARTTextPoint, EditorState } from './types.js';
import { cloneDocument, clonePoint, cloneSelection, samePath, validateSelection } from './tree.js';

export function createEditorState(
  document: ARTDocument,
  selection: ARTSelection | null = null,
): EditorState {
  const cloned = cloneDocument(document);
  if (selection) validateSelection(cloned, selection);
  return {
    document: cloned,
    selection: selection ? cloneSelection(selection) : null,
  };
}

export function textPoint(blockPath: ARTPath, offset: number): ARTTextPoint {
  return { blockPath: [...blockPath], offset };
}

export function textSelection(anchor: ARTTextPoint, head: ARTTextPoint = anchor): ARTSelection {
  return { anchor: clonePoint(anchor), head: clonePoint(head) };
}

export function isCollapsedSelection(selection: ARTSelection): boolean {
  return samePath(selection.anchor.blockPath, selection.head.blockPath)
    && selection.anchor.offset === selection.head.offset;
}
