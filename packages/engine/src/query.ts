import type { ARTHeadingNode, ARTTextMark } from '@arichtext/core';
import {
  getInlineBlock,
  selectedStyleBlocks,
  marksAtOffset,
  normalizeRange,
} from './tree.js';
import type { ARTMarkType, EditorState } from './types.js';

export interface ActiveBlock {
  type: 'paragraph' | 'heading';
  level?: ARTHeadingNode['level'];
}

/** Return marks common to every text segment touched by the current selection. */
export function getActiveMarks(state: EditorState): ARTTextMark[] {
  const selection = state.selection;
  if (!selection) return [];

  const range = normalizeRange(state.document, selection.anchor, selection.head);
  if (range.fromIndex === range.toIndex && range.from.offset === range.to.offset) {
    return marksAtOffset(range.blocks[range.fromIndex]!.block, range.from.offset);
  }

  const touched: ARTTextMark[][] = [];
  for (let blockIndex = range.fromIndex; blockIndex <= range.toIndex; blockIndex += 1) {
    const block = range.blocks[blockIndex]!.block;
    const blockLength = (block.content ?? []).reduce((length, node) => length + node.text.length, 0);
    const from = blockIndex === range.fromIndex ? range.from.offset : 0;
    const to = blockIndex === range.toIndex ? range.to.offset : blockLength;
    if (to <= from) continue;

    let cursor = 0;
    for (const node of block.content ?? []) {
      const start = cursor;
      const end = cursor + node.text.length;
      cursor = end;
      if (end <= from || start >= to) continue;
      touched.push(node.marks ? node.marks.map(cloneMark) : []);
    }
  }

  if (touched.length === 0) return [];
  return touched[0]!.filter((mark) => touched.every((marks) => hasEquivalentMark(marks, mark)));
}

export function isMarkActive(state: EditorState, type: ARTMarkType): boolean {
  return getActiveMarks(state).some((mark) => mark.type === type);
}

export function getActiveBlock(state: EditorState): ActiveBlock | null {
  const selection = state.selection;
  if (!selection) return null;
  const block = getInlineBlock(state.document, selection.anchor.blockPath);
  return block.type === 'heading'
    ? { type: 'heading', level: block.level }
    : { type: 'paragraph' };
}

function hasEquivalentMark(marks: readonly ARTTextMark[], expected: ARTTextMark): boolean {
  return marks.some((mark) => {
    if (mark.type !== expected.type) return false;
    if (expected.type === 'link') return mark.type === 'link' && mark.href === expected.href;
    if (expected.type === 'extensionMark') {
      return mark.type === 'extensionMark'
        && mark.name === expected.name
        && JSON.stringify(mark.attrs ?? {}) === JSON.stringify(expected.attrs ?? {});
    }
    return true;
  });
}

function cloneMark(mark: ARTTextMark): ARTTextMark {
  if (mark.type === 'link') return { type: 'link', href: mark.href };
  if (mark.type === 'extensionMark') {
    return {
      type: 'extensionMark',
      name: mark.name,
      ...(mark.attrs ? { attrs: structuredClone(mark.attrs) } : {}),
    };
  }
  return { type: mark.type };
}

/** Common paragraph/heading style, or 'mixed' for a heterogeneous selection. */
export function getSelectedBlockStyle(state: EditorState): ActiveBlock | 'mixed' | null {
  const blocks = selectedStyleBlocks(state);
  const first = blocks[0]?.block;
  if (!first) return null;
  if (blocks.some(({ block }) => block.type !== first.type
    || (block.type === 'heading' && first.type === 'heading' && block.level !== first.level))) return 'mixed';
  return first.type === 'heading' ? { type: 'heading', level: first.level } : { type: 'paragraph' };
}
