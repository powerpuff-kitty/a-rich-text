import { describe, expect, it } from 'vitest';
import { ART_DOCUMENT_VERSION, type ARTDocument } from '../../core/src/index.js';
import {
  EditorEngine,
  applyTransaction,
  createEditorState,
  textPoint,
  textSelection,
} from '../src/index.js';
import {
  deleteBackward,
  deleteForward,
  insertParagraph,
} from '../src/commands.js';

function paragraphs(...values: string[]): ARTDocument {
  return {
    type: 'doc',
    version: ART_DOCUMENT_VERSION,
    content: values.map((text) => ({
      type: 'paragraph',
      content: text ? [{ type: 'text', text }] : [],
    })),
  };
}

describe('structural editing', () => {
  it('splits a paragraph at the caret and moves selection to the new paragraph', () => {
    const state = createEditorState(
      paragraphs('hello'),
      textSelection(textPoint([0], 2)),
    );
    const command = insertParagraph(state)!;
    const result = applyTransaction(state, command);

    expect(result.state.document.content).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'he' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'llo' }] },
    ]);
    expect(result.state.selection).toEqual(textSelection(textPoint([1], 0)));
  });

  it('splits a heading into a heading followed by a paragraph', () => {
    const document: ARTDocument = {
      type: 'doc',
      version: ART_DOCUMENT_VERSION,
      content: [{ type: 'heading', level: 2, content: [{ type: 'text', text: 'Titlemore' }] }],
    };
    const state = createEditorState(document, textSelection(textPoint([0], 5)));
    const result = applyTransaction(state, insertParagraph(state)!);

    expect(result.state.document.content).toEqual([
      { type: 'heading', level: 2, content: [{ type: 'text', text: 'Title' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'more' }] },
    ]);
  });

  it('deletes an emoji grapheme as one unit', () => {
    const source = 'A👨‍👩‍👧‍👦B';
    const caret = source.length - 1;
    const state = createEditorState(
      paragraphs(source),
      textSelection(textPoint([0], caret)),
    );
    const result = applyTransaction(state, deleteBackward(state)!);

    expect(result.state.document.content[0]).toEqual({
      type: 'paragraph',
      content: [{ type: 'text', text: 'AB' }],
    });
    expect(result.state.selection).toEqual(textSelection(textPoint([0], 1)));
  });

  it('deletes the next grapheme without splitting surrogate pairs', () => {
    const state = createEditorState(
      paragraphs('A😀B'),
      textSelection(textPoint([0], 1)),
    );
    const result = applyTransaction(state, deleteForward(state)!);

    expect(result.state.document.content[0]).toEqual({
      type: 'paragraph',
      content: [{ type: 'text', text: 'AB' }],
    });
  });

  it('joins adjacent top-level blocks on backspace at block start', () => {
    const state = createEditorState(
      paragraphs('hello', 'world'),
      textSelection(textPoint([1], 0)),
    );
    const result = applyTransaction(state, deleteBackward(state)!);

    expect(result.state.document.content).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'helloworld' }] },
    ]);
    expect(result.state.selection).toEqual(textSelection(textPoint([0], 5)));
  });

  it('joins the next sibling on delete at block end while preserving the left block type', () => {
    const document: ARTDocument = {
      type: 'doc',
      version: ART_DOCUMENT_VERSION,
      content: [
        { type: 'heading', level: 2, content: [{ type: 'text', text: 'Head' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'tail' }] },
      ],
    };
    const state = createEditorState(document, textSelection(textPoint([0], 4)));
    const result = applyTransaction(state, deleteForward(state)!);

    expect(result.state.document.content).toEqual([
      { type: 'heading', level: 2, content: [{ type: 'text', text: 'Headtail' }] },
    ]);
    expect(result.state.selection).toEqual(textSelection(textPoint([0], 4)));
  });

  it('splits paragraphs nested in a list item without flattening the list', () => {
    const document: ARTDocument = {
      type: 'doc',
      version: ART_DOCUMENT_VERSION,
      content: [{
        type: 'list',
        style: 'bullet',
        content: [{
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'nested' }] }],
        }],
      }],
    };
    const state = createEditorState(document, textSelection(textPoint([0, 0, 0], 3)));
    const result = applyTransaction(state, insertParagraph(state)!);

    expect(result.state.document.content[0]).toMatchObject({
      type: 'list',
      content: [{
        type: 'listItem',
        content: [
          { type: 'paragraph', content: [{ text: 'nes' }] },
          { type: 'paragraph', content: [{ text: 'ted' }] },
        ],
      }],
    });
    expect(result.state.selection).toEqual(textSelection(textPoint([0, 0, 1], 0)));
  });

  it('does not join across container boundaries', () => {
    const document: ARTDocument = {
      type: 'doc',
      version: ART_DOCUMENT_VERSION,
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'outside' }] },
        {
          type: 'blockquote',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'inside' }] }],
        },
      ],
    };
    const state = createEditorState(document, textSelection(textPoint([1, 0], 0)));
    expect(deleteBackward(state)).toBeNull();
  });

  it('keeps split/join in undo history', () => {
    const engine = new EditorEngine(createEditorState(
      paragraphs('hello'),
      textSelection(textPoint([0], 2)),
    ));
    engine.dispatch(insertParagraph(engine.state)!);
    expect(engine.state.document.content).toHaveLength(2);

    engine.undo();
    expect(engine.state.document).toEqual(paragraphs('hello'));
    engine.redo();
    expect(engine.state.document.content).toHaveLength(2);
  });
});
