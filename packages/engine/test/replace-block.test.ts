import { describe, expect, it } from 'vitest';
import { ART_DOCUMENT_VERSION, type ARTBlockNode, type ARTDocument } from '../../core/src/index.js';
import {
  EditorEngine,
  applyTransaction,
  createEditorState,
  textPoint,
  textSelection,
  transaction,
} from '../src/index.js';

function paragraph(text: string): ARTBlockNode {
  return { type: 'paragraph', content: text ? [{ type: 'text', text }] : [] };
}

function doc(...content: ARTBlockNode[]): ARTDocument {
  return { type: 'doc', version: ART_DOCUMENT_VERSION, content };
}

describe('replaceBlock structural operation', () => {
  it('wraps a paragraph in a list and preserves the mapped logical selection', () => {
    const state = createEditorState(
      doc(paragraph('hello')),
      textSelection(textPoint([0], 2)),
    );
    const list: ARTBlockNode = {
      type: 'list',
      style: 'bullet',
      content: [{
        type: 'listItem',
        content: [paragraph('hello')],
      }],
    };

    const tx = transaction()
      .replaceBlock([0], [list], [{ from: [0], to: [0, 0, 0] }])
      .setSelection(textSelection(textPoint([0, 0, 0], 2)))
      .build();
    const result = applyTransaction(state, tx);

    expect(result.state.document.content).toEqual([list]);
    expect(result.state.selection).toEqual(textSelection(textPoint([0, 0, 0], 2)));
  });

  it('can replace one block with multiple blocks while later siblings shift', () => {
    const state = createEditorState(
      doc(paragraph('one'), paragraph('later')),
      textSelection(textPoint([1], 2)),
    );
    const tx = transaction()
      .replaceBlock(
        [0],
        [paragraph('one'), { type: 'horizontalRule' }],
        [{ from: [0], to: [0] }],
      )
      .setSelection(textSelection(textPoint([2], 2)))
      .build();
    const result = applyTransaction(state, tx);

    expect(result.state.document.content).toEqual([
      paragraph('one'),
      { type: 'horizontalRule' },
      paragraph('later'),
    ]);
    expect(result.state.selection).toEqual(textSelection(textPoint([2], 2)));
  });

  it('rejects mappings whose source is outside the replaced subtree', () => {
    const state = createEditorState(doc(paragraph('one'), paragraph('two')));
    const tx = transaction()
      .replaceBlock([0], [paragraph('one')], [{ from: [1], to: [0] }])
      .build();

    expect(() => applyTransaction(state, tx)).toThrow(/source must be inside the replaced subtree/);
  });

  it('rejects mapping targets outside the replacement span', () => {
    const state = createEditorState(doc(paragraph('one'), paragraph('two')));
    const tx = transaction()
      .replaceBlock([0], [paragraph('one')], [{ from: [0], to: [1] }])
      .build();

    expect(() => applyTransaction(state, tx)).toThrow(/target must be inside the replacement span/);
  });

  it('rejects duplicate source mappings', () => {
    const state = createEditorState(doc(paragraph('one')));
    const tx = transaction()
      .replaceBlock([0], [paragraph('one')], [
        { from: [0], to: [0] },
        { from: [0], to: [0] },
      ])
      .build();

    expect(() => applyTransaction(state, tx)).toThrow(/Duplicate replaceBlock path mapping source/);
  });

  it('rejects path continuity that lies about logical text preservation', () => {
    const state = createEditorState(doc(paragraph('one')));
    const tx = transaction()
      .replaceBlock([0], [paragraph('changed')], [{ from: [0], to: [0] }])
      .build();

    expect(() => applyTransaction(state, tx)).toThrow(/must preserve logical text/);
  });

  it('is a normal undoable engine history step', () => {
    const initial = createEditorState(
      doc(paragraph('hello')),
      textSelection(textPoint([0], 3)),
    );
    const engine = new EditorEngine(initial);
    const list: ARTBlockNode = {
      type: 'list',
      style: 'task',
      content: [{
        type: 'listItem',
        checked: false,
        content: [paragraph('hello')],
      }],
    };
    engine.dispatch(
      transaction()
        .replaceBlock([0], [list], [{ from: [0], to: [0, 0, 0] }])
        .setSelection(textSelection(textPoint([0, 0, 0], 3)))
        .build(),
    );

    expect(engine.state.document.content[0]?.type).toBe('list');
    const undo = engine.undo();
    expect(undo?.state.document).toEqual(initial.document);
    expect(undo?.state.selection).toEqual(initial.selection);
  });
});
