import type { ARTBlockNode } from '@arichtext/core';
import { transaction } from './transaction.js';
import { listInlineBlocks, cloneDocument, inlineLength } from './tree.js';
import type { EditorState, EditorTransaction, ARTSelection } from './types.js';

function assertIndex(state: EditorState, index: number): ARTBlockNode {
  if (!Number.isInteger(index) || index < 0 || index >= state.document.content.length) throw new RangeError('Block index is outside the document');
  return state.document.content[index]!;
}

export function moveBlock(state: EditorState, from: number, to: number): EditorTransaction | null {
  assertIndex(state, from); assertIndex(state, to);
  if (from === to) return null;
  return { operations: [{ type: 'moveBlock', from, to }], meta: { command: 'moveBlock' } };
}

export function duplicateBlock(state: EditorState, index: number): EditorTransaction {
  const block = assertIndex(state, index);
  const paths = listInlineBlocks(state.document).filter(entry => entry.path[0] === index);
  const copy = typeof structuredClone === 'function' ? structuredClone(block) : JSON.parse(JSON.stringify(block)) as ARTBlockNode;
  const builder = transaction().replaceBlock([index], [block, copy], paths.map(entry => ({ from: entry.path, to: entry.path })));
  const selection = state.selection && {
    anchor: { ...state.selection.anchor, blockPath: shifted(state.selection.anchor.blockPath, index, 1) },
    head: { ...state.selection.head, blockPath: shifted(state.selection.head.blockPath, index, 1) },
  };
  return builder.setSelection(selection).setMeta('command', 'duplicateBlock').build();
}

export function deleteBlock(state: EditorState, index: number): EditorTransaction {
  assertIndex(state, index);
  const content: ARTBlockNode[] = state.document.content.length === 1 ? [{ type: 'paragraph', content: [] }] : [];
  const builder = transaction().replaceBlock([index], content);
  const document = cloneDocument(state.document); document.content.splice(index, 1, ...content);
  const blocks = listInlineBlocks(document);
  let selection: ARTSelection | null = null;
  if (state.selection && state.selection.anchor.blockPath[0] !== index && state.selection.head.blockPath[0] !== index) {
    selection = {
      anchor: { ...state.selection.anchor, blockPath: shifted(state.selection.anchor.blockPath, index, -1) },
      head: { ...state.selection.head, blockPath: shifted(state.selection.head.blockPath, index, -1) },
    };
  } else {
    const next = blocks.find(entry => entry.path[0]! >= index) ?? blocks.at(-1);
    if (next) {
      const point = { blockPath: next.path, offset: next.path[0]! < index ? inlineLength(next.block) : 0 };
      selection = { anchor: point, head: point };
    }
  }
  return builder.setSelection(selection).setMeta('command', 'deleteBlock').build();
}

function shifted(path: readonly number[], index: number, delta: number): number[] {
  return path.length ? [path[0]! >= index ? path[0]! + delta : path[0]!, ...path.slice(1)] : [];
}
