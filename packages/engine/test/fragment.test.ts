import { describe, expect, it } from 'vitest';
import { ART_DOCUMENT_VERSION, type ARTBlockNode, type ARTDocument } from '../../core/src/index.js';
import {
  applyTransaction,
  createEditorState,
  textPoint,
  textSelection,
} from '../src/index.js';
import { insertFragment } from '../src/commands.js';

function paragraph(text: string): ARTBlockNode {
  return { type: 'paragraph', content: text ? [{ type: 'text', text }] : [] };
}

function document(text: string): ARTDocument {
  return { type: 'doc', version: ART_DOCUMENT_VERSION, content: [paragraph(text)] };
}

describe('ART fragment insertion', () => {
  it('merges a single rich paragraph into the current block', () => {
    const state = createEditorState(
      document('beforeafter'),
      textSelection(textPoint([0], 6)),
    );
    const fragment: ARTBlockNode[] = [{
      type: 'paragraph',
      content: [{ type: 'text', text: 'X', marks: [{ type: 'bold' }] }],
    }];

    const result = applyTransaction(state, insertFragment(state, fragment)!);

    expect(result.state.document.content).toEqual([{
      type: 'paragraph',
      content: [
        { type: 'text', text: 'before' },
        { type: 'text', text: 'X', marks: [{ type: 'bold' }] },
        { type: 'text', text: 'after' },
      ],
    }]);
    expect(result.state.selection).toEqual(textSelection(textPoint([0], 7)));
  });

  it('replaces the selected inline range with a rich fragment', () => {
    const state = createEditorState(
      document('hello world'),
      textSelection(textPoint([0], 6), textPoint([0], 11)),
    );
    const fragment: ARTBlockNode[] = [{
      type: 'paragraph',
      content: [{ type: 'text', text: 'ART', marks: [{ type: 'italic' }] }],
    }];

    const result = applyTransaction(state, insertFragment(state, fragment)!);
    expect(result.state.document.content[0]).toEqual({
      type: 'paragraph',
      content: [
        { type: 'text', text: 'hello ' },
        { type: 'text', text: 'ART', marks: [{ type: 'italic' }] },
      ],
    });
    expect(result.state.selection).toEqual(textSelection(textPoint([0], 9)));
  });

  it('splices multiple pasted paragraphs into the current parent', () => {
    const state = createEditorState(document('AAZZ'), textSelection(textPoint([0], 2)));
    const result = applyTransaction(state, insertFragment(state, [paragraph('BB'), paragraph('CC')])!);

    expect(result.state.document.content).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'AABB' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'CCZZ' }] },
    ]);
    expect(result.state.selection).toEqual(textSelection(textPoint([1], 2)));
  });

  it('places non-inline blocks between preserved left/right text blocks', () => {
    const state = createEditorState(document('AB'), textSelection(textPoint([0], 1)));
    const list: ARTBlockNode = {
      type: 'list',
      style: 'bullet',
      content: [{
        type: 'listItem',
        content: [paragraph('item')],
      }],
    };
    const result = applyTransaction(state, insertFragment(state, [list])!);

    expect(result.state.document.content).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'A' }] },
      list,
      { type: 'paragraph', content: [{ type: 'text', text: 'B' }] },
    ]);
    expect(result.state.selection).toEqual(textSelection(textPoint([2], 0)));
  });

  it('refuses cross-block selections rather than guessing paste merge semantics', () => {
    const multi: ARTDocument = {
      type: 'doc',
      version: ART_DOCUMENT_VERSION,
      content: [paragraph('one'), paragraph('two')],
    };
    const state = createEditorState(
      multi,
      textSelection(textPoint([0], 1), textPoint([1], 2)),
    );
    expect(insertFragment(state, [paragraph('paste')])).toBeNull();
  });
});
