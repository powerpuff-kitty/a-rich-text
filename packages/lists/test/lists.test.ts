import { describe, expect, it } from 'vitest';
import { createAnchoredRange, mapAnchoredRangeThroughTransaction } from '../../annotations/src/index.js';
import type { ARTBlockNode, ARTDocument } from '../../core/src/index.js';
import {
  EditorEngine,
  applyTransaction,
  createEditorState,
  textPoint,
  textSelection,
} from '../../engine/src/index.js';
import {
  getActiveList,
  setListStyle,
  setTaskItemChecked,
  toggleList,
} from '../src/index.js';

function paragraph(text: string): ARTBlockNode {
  return { type: 'paragraph', content: text ? [{ type: 'text', text }] : [] };
}

function document(...content: ARTBlockNode[]): ARTDocument {
  return { type: 'doc', version: 1, content };
}

describe('@arichtext/lists', () => {
  it('wraps a paragraph while preserving logical selection and annotation offsets', () => {
    const doc = document(paragraph('hello'), paragraph('later'));
    const state = createEditorState(doc, textSelection(textPoint([0], 1), textPoint([0], 4)));
    const anchor = createAnchoredRange(doc, state.selection!);
    const tx = toggleList(state, 'bullet')!;
    const result = applyTransaction(state, tx);
    const mapped = mapAnchoredRangeThroughTransaction(doc, anchor, tx);

    expect(result.state.document.content[0]).toMatchObject({
      type: 'list',
      style: 'bullet',
      content: [{ content: [{ type: 'paragraph', content: [{ text: 'hello' }] }] }],
    });
    expect(result.state.selection).toEqual(
      textSelection(textPoint([0, 0, 0], 1), textPoint([0, 0, 0], 4)),
    );
    expect(mapped.status).toBe('mapped');
    if (mapped.status !== 'orphaned') {
      expect(mapped.range.start).toMatchObject({ blockPath: [0, 0, 0], offset: 1 });
      expect(mapped.range.end).toMatchObject({ blockPath: [0, 0, 0], offset: 4 });
    }
  });

  it('converts list style in place and initializes/removes task state', () => {
    const doc: ARTDocument = {
      type: 'doc',
      version: 1,
      content: [{
        type: 'list',
        style: 'bullet',
        content: [
          { type: 'listItem', content: [paragraph('one')] },
          { type: 'listItem', content: [paragraph('two')] },
        ],
      }],
    };
    let state = createEditorState(doc, textSelection(textPoint([0, 1, 0], 1)));

    state = applyTransaction(state, setListStyle(state, 'task')!).state;
    expect(state.document.content[0]).toMatchObject({
      type: 'list',
      style: 'task',
      content: [
        { checked: false },
        { checked: false },
      ],
    });
    expect(state.selection).toEqual(textSelection(textPoint([0, 1, 0], 1)));

    state = applyTransaction(state, setTaskItemChecked(state, true)!).state;
    expect(state.document.content[0]).toMatchObject({
      style: 'task',
      content: [{ checked: false }, { checked: true }],
    });

    state = applyTransaction(state, setListStyle(state, 'ordered')!).state;
    expect(state.document.content[0]).toMatchObject({
      type: 'list',
      style: 'ordered',
      content: [
        { type: 'listItem' },
        { type: 'listItem' },
      ],
    });
    expect(JSON.stringify(state.document)).not.toContain('"checked"');
  });

  it('unwraps a same-style multi-item list into sibling blocks with mapped selection', () => {
    const doc: ARTDocument = {
      type: 'doc',
      version: 1,
      content: [{
        type: 'list',
        style: 'bullet',
        content: [
          { type: 'listItem', content: [paragraph('one')] },
          { type: 'listItem', content: [paragraph('two'), paragraph('detail')] },
        ],
      }, paragraph('later')],
    };
    const state = createEditorState(
      doc,
      textSelection(textPoint([0, 1, 1], 1), textPoint([0, 1, 1], 5)),
    );
    const tx = toggleList(state, 'bullet')!;
    const result = applyTransaction(state, tx);

    expect(result.state.document.content).toEqual([
      paragraph('one'),
      paragraph('two'),
      paragraph('detail'),
      paragraph('later'),
    ]);
    expect(result.state.selection).toEqual(
      textSelection(textPoint([2], 1), textPoint([2], 5)),
    );
  });

  it('uses the closest nested list for commands', () => {
    const doc: ARTDocument = {
      type: 'doc',
      version: 1,
      content: [{
        type: 'list',
        style: 'bullet',
        content: [{
          type: 'listItem',
          content: [{
            type: 'list',
            style: 'ordered',
            content: [{ type: 'listItem', content: [paragraph('nested')] }],
          }],
        }],
      }],
    };
    const state = createEditorState(doc, textSelection(textPoint([0, 0, 0, 0, 0], 2)));
    expect(getActiveList(state)).toEqual({
      path: [0, 0, 0],
      style: 'ordered',
      itemIndex: 0,
    });
  });

  it('returns null for invalid/cross-block list commands', () => {
    const doc = document(paragraph('one'), paragraph('two'));
    const cross = createEditorState(
      doc,
      textSelection(textPoint([0], 0), textPoint([1], 2)),
    );
    expect(toggleList(cross, 'bullet')).toBeNull();
    expect(setListStyle(cross, 'ordered')).toBeNull();
    expect(setTaskItemChecked(cross, true)).toBeNull();
  });

  it('is undoable as a normal engine history step', () => {
    const initial = createEditorState(
      document(paragraph('hello')),
      textSelection(textPoint([0], 2)),
    );
    const engine = new EditorEngine(initial);
    engine.dispatch(toggleList(engine.state, 'task')!);
    expect(engine.state.document.content[0]?.type).toBe('list');
    expect(engine.undo()?.state).toEqual(initial);
  });
});
