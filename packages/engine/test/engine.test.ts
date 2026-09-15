import { describe, expect, it } from 'vitest';
import { ART_DOCUMENT_VERSION, type ARTDocument } from '../../core/src/index.js';
import {
  EditorEngine,
  applyTransaction,
  createEditorState,
  textPoint,
  textSelection,
  transaction,
} from '../src/index.js';

function documentWithParagraphs(...paragraphs: string[]): ARTDocument {
  return {
    type: 'doc',
    version: ART_DOCUMENT_VERSION,
    content: paragraphs.map((text) => ({
      type: 'paragraph',
      content: text ? [{ type: 'text', text }] : [],
    })),
  };
}

describe('@arichtext/engine', () => {
  it('applies text edits immutably and collapses the selection after insertion', () => {
    const document = documentWithParagraphs('Hello world');
    const state = createEditorState(document, textSelection(textPoint([0], 6), textPoint([0], 11)));

    const result = applyTransaction(
      state,
      transaction().replaceText(textPoint([0], 6), textPoint([0], 11), 'ART').build(),
    );

    expect(document.content[0]).toMatchObject({
      type: 'paragraph',
      content: [{ text: 'Hello world' }],
    });
    expect(result.state.document.content[0]).toMatchObject({
      type: 'paragraph',
      content: [{ text: 'Hello ART' }],
    });
    expect(result.state.selection).toEqual(textSelection(textPoint([0], 9)));
    expect(result.documentChanged).toBe(true);
  });

  it('formats a range across blocks without depending on text-run boundaries', () => {
    const state = createEditorState(documentWithParagraphs('alpha', 'bravo'));
    const result = applyTransaction(
      state,
      transaction().addMark(textPoint([0], 2), textPoint([1], 3), { type: 'bold' }).build(),
    );

    expect(result.state.document.content).toEqual([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'al' },
          { type: 'text', text: 'pha', marks: [{ type: 'bold' }] },
        ],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'bra', marks: [{ type: 'bold' }] },
          { type: 'text', text: 'vo' },
        ],
      },
    ]);
  });

  it('toggles a mark off when the full selected range already has it', () => {
    const document: ARTDocument = {
      type: 'doc',
      version: ART_DOCUMENT_VERSION,
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: 'bold', marks: [{ type: 'bold' }] }],
      }],
    };
    const result = applyTransaction(
      createEditorState(document),
      transaction().toggleMark(textPoint([0], 0), textPoint([0], 4), { type: 'bold' }).build(),
    );

    expect(result.state.document.content[0]).toEqual({
      type: 'paragraph',
      content: [{ type: 'text', text: 'bold' }],
    });
  });

  it('replaces a cross-block range without implicitly merging block structure', () => {
    const state = createEditorState(documentWithParagraphs('alpha', 'middle', 'omega'));
    const result = applyTransaction(
      state,
      transaction().replaceText(textPoint([0], 2), textPoint([2], 2), 'X').build(),
    );

    expect(result.state.document.content).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'alX' }] },
      { type: 'paragraph', content: [] },
      { type: 'paragraph', content: [{ type: 'text', text: 'ega' }] },
    ]);
    expect(result.state.selection).toEqual(textSelection(textPoint([0], 3)));
  });

  it('converts paragraphs and headings while preserving inline content', () => {
    const state = createEditorState(documentWithParagraphs('Title'));
    const heading = applyTransaction(
      state,
      transaction().setBlockType([0], 'heading', 2).build(),
    );

    expect(heading.state.document.content[0]).toEqual({
      type: 'heading',
      level: 2,
      content: [{ type: 'text', text: 'Title' }],
    });

    const paragraph = applyTransaction(
      heading.state,
      transaction().setBlockType([0], 'paragraph').build(),
    );
    expect(paragraph.state.document.content[0]).toEqual({
      type: 'paragraph',
      content: [{ type: 'text', text: 'Title' }],
    });
  });

  it('fails invalid operations atomically', () => {
    const state = createEditorState(documentWithParagraphs('safe'));
    expect(() => applyTransaction(
      state,
      transaction()
        .addMark(textPoint([0], 0), textPoint([0], 4), { type: 'italic' })
        .replaceText(textPoint([99], 0), textPoint([99], 0), 'invalid')
        .build(),
    )).toThrow(RangeError);

    expect(state.document).toEqual(documentWithParagraphs('safe'));
  });

  it('undoes and redoes both document and selection state', () => {
    const initial = createEditorState(
      documentWithParagraphs('one'),
      textSelection(textPoint([0], 3)),
    );
    const engine = new EditorEngine(initial, { historyLimit: 10 });

    engine.dispatch(
      transaction().replaceText(textPoint([0], 3), textPoint([0], 3), ' two'),
    );
    expect(engine.state.document.content[0]).toMatchObject({
      content: [{ text: 'one two' }],
    });
    expect(engine.state.selection).toEqual(textSelection(textPoint([0], 7)));

    engine.undo();
    expect(engine.state.document).toEqual(initial.document);
    expect(engine.state.selection).toEqual(initial.selection);

    engine.redo();
    expect(engine.state.document.content[0]).toMatchObject({
      content: [{ text: 'one two' }],
    });
    expect(engine.state.selection).toEqual(textSelection(textPoint([0], 7)));
  });

  it('does not add selection-only transactions to undo history', () => {
    const engine = new EditorEngine(createEditorState(documentWithParagraphs('abc')));
    engine.dispatch(
      transaction().setSelection(textSelection(textPoint([0], 2))),
    );

    expect(engine.canUndo).toBe(false);
    expect(engine.state.selection).toEqual(textSelection(textPoint([0], 2)));
  });
});
