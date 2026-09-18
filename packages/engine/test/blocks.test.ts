import { describe, expect, it } from 'vitest';
import { createEditorState, textPoint, textSelection, applyTransaction } from '../src/index.js';
import { deleteBlock, duplicateBlock, moveBlock } from '../src/blocks.js';
const doc = { type: 'doc' as const, version: 1 as const, content: [
  { type: 'paragraph' as const, content: [{ type: 'text' as const, text: 'one' }] },
  { type: 'paragraph' as const, content: [{ type: 'text' as const, text: 'two' }] },
  { type: 'paragraph' as const, content: [{ type: 'text' as const, text: 'three' }] },
] };
describe('block interaction commands', () => {
  it('moves blocks and maps the caret', () => {
    const state = createEditorState(doc, textSelection(textPoint([0], 2)));
    const result = applyTransaction(state, moveBlock(state, 0, 2)!);
    expect(result.state.document.content.map(block => block.content?.[0]?.text)).toEqual(['two', 'three', 'one']);
    expect(result.state.selection?.anchor.blockPath).toEqual([2]);
  });
  it('duplicates content without sharing it and keeps selection on duplicate', () => {
    const state = createEditorState(doc, textSelection(textPoint([0], 1)));
    const result = applyTransaction(state, duplicateBlock(state, 0));
    expect(result.state.document.content.map(block => block.content?.[0]?.text)).toEqual(['one', 'one', 'two', 'three']);
    expect(result.state.selection?.anchor.blockPath).toEqual([1]);
    expect(result.state.document.content[0]).not.toBe(result.state.document.content[1]);
  });
  it('deletes the last remaining block to an editable empty paragraph', () => {
    const state = createEditorState({ type: 'doc', version: 1, content: [doc.content[0]!] }, textSelection(textPoint([0], 1)));
    const result = applyTransaction(state, deleteBlock(state, 0));
    expect(result.state.document.content).toEqual([{ type: 'paragraph', content: [] }]);
    expect(result.state.selection).toEqual(textSelection(textPoint([0], 0)));
  });
});
