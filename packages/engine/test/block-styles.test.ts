import { describe, expect, it } from 'vitest';
import type { ARTDocument } from '../../core/src/index.js';
import { EditorEngine, createEditorState, getSelectedBlockStyle, textPoint, textSelection } from '../src/index.js';
import { setCurrentHeading, setCurrentParagraph } from '../src/commands.js';

const document: ARTDocument = { type: 'doc', version: 1, content: [
  { type: 'paragraph', content: [{ type: 'text', text: 'first', marks: [{ type: 'bold' }] }] },
  { type: 'blockquote', content: [{ type: 'heading', level: 2, content: [{ type: 'text', text: 'second' }] }] },
  { type: 'codeBlock', text: 'untouched' },
  { type: 'paragraph', content: [{ type: 'text', text: 'third' }] },
] };

describe('selection block styles', () => {
  it.each([false, true])('changes nested blocks in one undo step with reversed=%s', reversed => {
    const from = textPoint([0], 1), to = textPoint([3], 2);
    const selection = reversed ? textSelection(to, from) : textSelection(from, to);
    const engine = new EditorEngine(createEditorState(document, selection));
    expect(getSelectedBlockStyle(engine.state)).toBe('mixed');
    engine.dispatch(setCurrentHeading(engine.state, 4)!);
    expect(getSelectedBlockStyle(engine.state)).toEqual({ type: 'heading', level: 4 });
    expect(engine.state.selection).toEqual(selection);
    expect(engine.state.document.content[0]).toMatchObject({ type: 'heading', level: 4, content: [{ marks: [{ type: 'bold' }] }] });
    expect(engine.state.document.content[1]).toMatchObject({ type: 'blockquote', content: [{ type: 'heading', level: 4 }] });
    expect(engine.state.document.content[2]).toEqual(document.content[2]);
    engine.undo();
    expect(engine.state.document).toEqual(document);
    engine.redo();
    engine.dispatch(setCurrentParagraph(engine.state)!);
    expect(getSelectedBlockStyle(engine.state)).toEqual({ type: 'paragraph' });
  });

  it.each([false, true])('excludes a following block at offset zero with reversed=%s', reversed => {
    const from = textPoint([0], 2), to = textPoint([1, 0], 0);
    const state = createEditorState(document, reversed ? textSelection(to, from) : textSelection(from, to));
    expect(getSelectedBlockStyle(state)).toEqual({ type: 'paragraph' });
    expect(setCurrentHeading(state, 6)?.operations).toEqual([{ type: 'setBlockType', path: [0], blockType: 'heading', level: 6 }]);
  });

  it('handles collapsed and absent selections', () => {
    const state = createEditorState(document, textSelection(textPoint([1, 0], 0)));
    expect(getSelectedBlockStyle(state)).toEqual({ type: 'heading', level: 2 });
    expect(setCurrentParagraph(state)?.operations).toHaveLength(1);
    expect(getSelectedBlockStyle({ ...state, selection: null })).toBeNull();
    expect(setCurrentHeading({ ...state, selection: null }, 2)).toBeNull();
  });
});
