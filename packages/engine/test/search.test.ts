import { describe, expect, it } from 'vitest';
import { ART_DOCUMENT_VERSION, type ARTDocument } from '../../core/src/index.js';
import { createEditorState, EditorEngine, findText, replaceSearchMatches } from '../src/index.js';

const doc = (content: ARTDocument['content']): ARTDocument => ({ type: 'doc', version: ART_DOCUMENT_VERSION, content });
const paragraph = (text: string) => ({ type: 'paragraph' as const, content: [{ type: 'text' as const, text }] });

describe('literal document search', () => {
  it('matches across marks and nested editable blocks, excluding atomic metadata', () => {
    const document = doc([
      { type: 'heading', level: 2, content: [{ type: 'text', text: 'a+', marks: [{ type: 'bold' }] }, { type: 'text', text: 'b a+b' }] },
      { type: 'blockquote', content: [paragraph('a+b')] },
      { type: 'codeBlock', text: 'a+b' }, { type: 'image', src: '/a+b.png', alt: 'a+b' },
    ]);
    const found = findText(document, 'a+b');
    expect(found.map(match => [match.selection.anchor.blockPath, match.selection.anchor.offset])).toEqual([[[0], 0], [[0], 4], [[1, 0], 0]]);
    expect(findText(document, '')).toEqual([]);
    expect(findText(doc([paragraph('aa'), paragraph('aa')]), 'aaaa')).toEqual([]);
    expect(findText(doc([paragraph('aaaa')]), 'aa')).toHaveLength(2);
  });

  it('preserves Unicode offsets and supports case and Unicode word boundaries', () => {
    const document = doc([paragraph('😀 Café CAFÉ caféine _café café2 café\u0301')]);
    expect(findText(document, 'café', { wholeWord: true }).map(match => match.selection.anchor.offset)).toEqual([3, 8]);
    expect(findText(document, 'Café', { matchCase: true })).toHaveLength(1);
    expect(findText(document, '😀')[0]!.selection.head.offset).toBe(2);
    expect(findText(document, '\ud83d')).toEqual([]);
  });

  it('replaces a snapshot in reverse order with first-character marks and one undo step', () => {
    const document = doc([{ type: 'paragraph', content: [
      { type: 'text', text: 'prefix ', marks: [{ type: 'italic' }] },
      { type: 'text', text: 'foo', marks: [{ type: 'bold' }] }, { type: 'text', text: ' foo' },
    ] }]);
    const engine = new EditorEngine(createEditorState(document));
    engine.dispatch(replaceSearchMatches(engine.state, 'foo', 'foofoo')!);
    expect(findText(engine.state.document, 'foo')).toHaveLength(4);
    expect(engine.state.document.content[0]).toEqual({ type: 'paragraph', content: [
      { type: 'text', text: 'prefix ', marks: [{ type: 'italic' }] },
      { type: 'text', text: 'foofoo', marks: [{ type: 'bold' }] }, { type: 'text', text: ' foofoo' },
    ] });
    engine.undo(); expect(engine.state.document).toEqual(document); expect(engine.canUndo).toBe(false);
    engine.redo(); expect(findText(engine.state.document, 'foo')).toHaveLength(4);
  });

  it('replaces one indexed match, deletes text and rejects stale/out-of-bounds indices', () => {
    const engine = new EditorEngine(createEditorState(doc([paragraph('one ONE one')])));
    engine.dispatch(replaceSearchMatches(engine.state, 'one', '', {}, 1)!);
    expect(engine.state.document.content).toEqual([paragraph('one  one')]);
    for (const index of [-1, 2, 0.5, NaN]) expect(replaceSearchMatches(engine.state, 'one', 'new', {}, index)).toBeNull();
    expect(replaceSearchMatches(engine.state, 'missing', 'new')).toBeNull();
  });

  it('keeps identical replacement text and mixed formatting unchanged', () => {
    const state = createEditorState(doc([{ type: 'paragraph', content: [
      { type: 'text', text: 'f', marks: [{ type: 'bold' }] }, { type: 'text', text: 'oo' },
    ] }]));
    expect(replaceSearchMatches(state, 'foo', 'foo')).toBeNull();
  });

  it('replaces nested list and table text without restructuring blocks', () => {
    const document = doc([
      { type: 'list', style: 'bullet', content: [{ type: 'listItem', content: [paragraph('cat cat')] }] },
      { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [paragraph('cat')] }] }] },
    ]);
    const engine = new EditorEngine(createEditorState(document));
    engine.dispatch(replaceSearchMatches(engine.state, 'cat', 'dog')!);
    expect(findText(engine.state.document, 'dog').map(match => match.selection.anchor.blockPath)).toEqual([[0, 0, 0], [0, 0, 0], [1, 0, 0, 0]]);
    engine.undo(); expect(engine.state.document).toEqual(document);
  });
});
