// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemorySuggestionsProvider } from '../../suggestions/src/memory.js';
import { textPoint, textSelection, transaction } from '../../engine/src/index.js';
import { ARichTextElement } from '../../web-component/src/index.js';
import {
  SuggestionsEditorError,
  connectSuggestions,
} from '../src/index.js';

beforeEach(() => {
  document.body.innerHTML = '';
  document.getSelection()?.removeAllRanges();
});

function createEditor(text = 'hello world'): ARichTextElement {
  const editor = document.createElement('a-rich-text') as ARichTextElement;
  document.body.append(editor);
  editor.setText(text);
  editor.dispatch(
    transaction()
      .setSelection(textSelection(textPoint([0], 6), textPoint([0], 11)))
      .build(),
  );
  return editor;
}

async function settle(iterations = 16): Promise<void> {
  for (let index = 0; index < iterations; index += 1) await Promise.resolve();
}

describe('@arichtext/suggestions-editor', () => {
  it('creates replacement/insertion/deletion suggestions without changing ART', async () => {
    const provider = createMemorySuggestionsProvider();
    const editor = createEditor();
    const controller = await connectSuggestions(editor, provider, {
      documentId: 'doc-create',
      clientId: 'a',
      author: { id: 'alice' },
    });
    const initial = editor.serializeJSON();

    const replacement = await controller.createSuggestion('earth', { id: 'replace' });
    expect(replacement).toMatchObject({ kind: 'replace', originalText: 'world', replacementText: 'earth' });
    expect(editor.serializeJSON()).toBe(initial);

    editor.dispatch(transaction().setSelection(textSelection(textPoint([0], 6))).build());
    const insertion = await controller.createSuggestion('big ', { id: 'insert' });
    expect(insertion).toMatchObject({ kind: 'insert', originalText: '', replacementText: 'big ' });

    editor.dispatch(
      transaction().setSelection(textSelection(textPoint([0], 6), textPoint([0], 11))).build(),
    );
    const deletion = await controller.createSuggestion('', { id: 'delete' });
    expect(deletion).toMatchObject({ kind: 'delete', originalText: 'world', replacementText: '' });
    expect(editor.serializeJSON()).toBe(initial);

    await controller.disconnect();
  });

  it('maps through unrelated edits while preserving pending source text', async () => {
    const provider = createMemorySuggestionsProvider();
    const editor = createEditor();
    const controller = await connectSuggestions(editor, provider, {
      documentId: 'doc-map',
      clientId: 'a',
      author: { id: 'alice' },
    });
    const suggestion = await controller.createSuggestion('earth');

    editor.dispatch(
      transaction().replaceText(textPoint([0], 0), textPoint([0], 0), 'Say ').build(),
    );
    await settle();

    const mapped = controller.getSuggestion(suggestion.id)!;
    expect(mapped.status).toBe('pending');
    expect(mapped.anchor.status).toBe('mapped');
    if (mapped.anchor.status !== 'orphaned') {
      expect(mapped.anchor.range.start.offset).toBe(10);
      expect(mapped.anchor.range.end.offset).toBe(15);
    }
    expect(controller.session.getSuggestion(suggestion.id)?.anchor).toEqual(mapped.anchor);

    await controller.disconnect();
  });

  it('marks overlapping source edits conflicted instead of rebasing silently', async () => {
    const provider = createMemorySuggestionsProvider();
    const editor = createEditor();
    const conflict = vi.fn();
    const controller = await connectSuggestions(editor, provider, {
      documentId: 'doc-conflict',
      clientId: 'a',
      author: { id: 'alice' },
      onConflict: conflict,
    });
    const suggestion = await controller.createSuggestion('earth');

    editor.dispatch(
      transaction().replaceText(textPoint([0], 7), textPoint([0], 8), 'X').build(),
    );
    await settle();

    expect(controller.getSuggestion(suggestion.id)).toMatchObject({
      status: 'conflicted',
      conflictReason: 'Suggestion source text changed',
    });
    expect(controller.session.getSuggestion(suggestion.id)?.status).toBe('conflicted');
    expect(conflict).toHaveBeenCalledTimes(1);

    await controller.disconnect();
  });

  it('accepts explicitly through an undoable engine transaction', async () => {
    const provider = createMemorySuggestionsProvider();
    const editor = createEditor();
    const controller = await connectSuggestions(editor, provider, {
      documentId: 'doc-accept',
      clientId: 'a',
      author: { id: 'alice' },
    });
    const suggestion = await controller.createSuggestion('earth');

    const accepted = await controller.accept(suggestion.id, { id: 'reviewer' });
    expect(editor.getText()).toBe('hello earth');
    expect(accepted).toMatchObject({
      status: 'accepted',
      resolvedBy: { id: 'reviewer' },
    });
    expect(editor.undo()).toBe(true);
    expect(editor.getText()).toBe('hello world');
    expect(controller.getSuggestion(suggestion.id)?.status).toBe('accepted');

    await controller.disconnect();
  });

  it('rejects without changing the document', async () => {
    const provider = createMemorySuggestionsProvider();
    const editor = createEditor();
    const controller = await connectSuggestions(editor, provider, {
      documentId: 'doc-reject',
      clientId: 'a',
      author: { id: 'alice' },
    });
    const suggestion = await controller.createSuggestion('earth');
    const before = editor.serializeJSON();

    const rejected = await controller.reject(suggestion.id, { id: 'reviewer' });
    expect(rejected.status).toBe('rejected');
    expect(editor.serializeJSON()).toBe(before);

    await controller.disconnect();
  });

  it('persists a conflict before refusing stale acceptance', async () => {
    const provider = createMemorySuggestionsProvider();
    const editor = createEditor();
    const controller = await connectSuggestions(editor, provider, {
      documentId: 'doc-stale',
      clientId: 'a',
      author: { id: 'alice' },
    });
    const suggestion = await controller.createSuggestion('earth');

    editor.setText('completely different');

    await expect(controller.accept(suggestion.id, { id: 'reviewer' })).rejects.toMatchObject({
      code: 'source-mismatch',
    });
    expect(controller.session.getSuggestion(suggestion.id)?.status).toBe('conflicted');
    expect(editor.getText()).toBe('completely different');

    await controller.disconnect();
  });

  it('blocks acceptance while readonly', async () => {
    const provider = createMemorySuggestionsProvider();
    const editor = createEditor();
    const controller = await connectSuggestions(editor, provider, {
      documentId: 'doc-readonly',
      clientId: 'a',
      author: { id: 'alice' },
    });
    const suggestion = await controller.createSuggestion('earth');
    editor.readOnly = true;

    await expect(controller.accept(suggestion.id, { id: 'reviewer' })).rejects.toMatchObject({
      code: 'editor-locked',
    });
    expect(editor.getText()).toBe('hello world');
    expect(controller.getSuggestion(suggestion.id)?.status).toBe('pending');

    await controller.disconnect();
  });

  it('surfaces post-apply provider persistence failure with the applied transaction result', async () => {
    const memory = createMemorySuggestionsProvider();
    const editor = createEditor();
    const baseSession = await memory.connect({ documentId: 'doc-fail', clientId: 'a' });
    const provider = {
      name: 'failing-accept',
      async connect() {
        return {
          ...baseSession,
          get documentId() { return baseSession.documentId; },
          get clientId() { return baseSession.clientId; },
          listSuggestions: baseSession.listSuggestions.bind(baseSession),
          getSuggestion: baseSession.getSuggestion.bind(baseSession),
          createSuggestion: baseSession.createSuggestion.bind(baseSession),
          updateAnchor: baseSession.updateAnchor.bind(baseSession),
          rejectSuggestion: baseSession.rejectSuggestion.bind(baseSession),
          markConflicted: baseSession.markConflicted.bind(baseSession),
          subscribe: baseSession.subscribe.bind(baseSession),
          close: baseSession.close.bind(baseSession),
          async acceptSuggestion() {
            throw new Error('persistence unavailable');
          },
        };
      },
    };
    const controller = await connectSuggestions(editor, provider, {
      documentId: 'doc-fail',
      clientId: 'a',
      author: { id: 'alice' },
    });
    const suggestion = await controller.createSuggestion('earth');

    let error: unknown;
    try {
      await controller.accept(suggestion.id, { id: 'reviewer' });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(SuggestionsEditorError);
    expect(error).toMatchObject({ code: 'persistence-failed' });
    expect((error as SuggestionsEditorError).transactionResult?.documentChanged).toBe(true);
    expect(editor.getText()).toBe('hello earth');

    await controller.disconnect();
  });
});
