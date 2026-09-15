// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AITextProvider } from '../../ai/src/index.js';
import { textPoint, textSelection, transaction } from '../../engine/src/index.js';
import { ARichTextElement } from '../../web-component/src/index.js';
import {
  AIEditorError,
  applyAIProposal,
  createAIProposal,
} from '../src/index.js';

beforeEach(() => {
  document.body.innerHTML = '';
  document.getSelection()?.removeAllRanges();
});

function createEditor(text: string, from = 0, to = text.length): ARichTextElement {
  const editor = document.createElement('a-rich-text') as ARichTextElement;
  document.body.append(editor);
  editor.setText(text);
  editor.dispatch(
    transaction()
      .setSelection(textSelection(textPoint([0], from), textPoint([0], to)))
      .build(),
  );
  return editor;
}

function provider(generateText: AITextProvider['generateText'], name = 'local'): AITextProvider {
  return { name, generateText };
}

describe('@arichtext/ai-editor', () => {
  it('generates without mutating the editor, then explicitly applies as an undoable edit', async () => {
    const editor = createEditor('Hello world!', 6, 11);
    const starts = vi.fn();
    const ready = vi.fn((event: Event) => {
      const detail = (event as CustomEvent<{ proposal: { replacementText: string } }>).detail;
      detail.proposal.replacementText = 'event mutation';
    });
    const applied = vi.fn();
    editor.addEventListener('ai-proposal-start', starts);
    editor.addEventListener('ai-proposal-ready', ready);
    editor.addEventListener('ai-proposal-applied', applied);

    const task = createAIProposal(editor, provider(() => 'earth'), { task: 'rewrite' });
    const proposal = await task.promise;

    expect(editor.getText()).toBe('Hello world!');
    expect(proposal.replacementText).toBe('earth');
    expect(starts).toHaveBeenCalledTimes(1);
    expect(ready).toHaveBeenCalledTimes(1);

    applyAIProposal(editor, proposal);
    expect(editor.getText()).toBe('Hello earth!');
    expect(applied).toHaveBeenCalledTimes(1);

    expect(editor.undo()).toBe(true);
    expect(editor.getText()).toBe('Hello world!');
  });

  it('emits streaming delta events without applying partial model output', async () => {
    async function* stream() {
      yield 'new';
      yield ' text';
    }
    const editor = createEditor('old', 0, 3);
    const deltas: string[] = [];
    editor.addEventListener('ai-proposal-delta', (event) => {
      deltas.push((event as CustomEvent<{ accumulated: string }>).detail.accumulated);
    });

    const proposal = await createAIProposal(editor, provider(() => stream()), {
      task: 'rewrite',
    }).promise;

    expect(deltas).toEqual(['new', 'new text']);
    expect(proposal.replacementText).toBe('new text');
    expect(editor.getText()).toBe('old');
  });

  it('rejects stale proposals after any canonical document change', async () => {
    const editor = createEditor('hello world', 6, 11);
    const proposal = await createAIProposal(editor, provider(() => 'earth'), { task: 'rewrite' }).promise;

    editor.setText('hello changed');

    expect(() => applyAIProposal(editor, proposal)).toThrowError(
      expect.objectContaining({ code: 'stale-proposal' }),
    );
    expect(editor.getText()).toBe('hello changed');
  });

  it('supports collapsed continuation through the same review/apply flow', async () => {
    const editor = createEditor('Once', 4, 4);
    const proposal = await createAIProposal(editor, provider(() => ' upon a time'), {
      task: 'continue',
    }).promise;

    expect(editor.getText()).toBe('Once');
    applyAIProposal(editor, proposal);
    expect(editor.getText()).toBe('Once upon a time');
  });

  it('cancels provider work and emits an error event', async () => {
    async function* stream() {
      yield 'first';
      await Promise.resolve();
      yield 'second';
    }
    const editor = createEditor('hello', 0, 5);
    const errors = vi.fn();
    editor.addEventListener('ai-proposal-error', errors);

    const task = createAIProposal(editor, provider(() => stream()), { task: 'rewrite' });
    task.cancel('user-cancelled');

    await expect(task.promise).rejects.toMatchObject({ code: 'aborted' });
    expect(errors).toHaveBeenCalledTimes(1);
    expect(editor.getText()).toBe('hello');
  });

  it('forwards an external AbortSignal into the task', async () => {
    const controller = new AbortController();
    controller.abort('external');
    const editor = createEditor('hello', 0, 5);

    const task = createAIProposal(editor, provider(() => 'unused'), {
      task: 'rewrite',
      signal: controller.signal,
    });

    expect(task.signal.aborted).toBe(true);
    await expect(task.promise).rejects.toMatchObject({ code: 'aborted' });
  });

  it('blocks generation and application while readonly or disabled', async () => {
    const readonly = createEditor('hello', 0, 5);
    readonly.readOnly = true;
    const task = createAIProposal(readonly, provider(() => 'world'), { task: 'rewrite' });
    await expect(task.promise).rejects.toBeInstanceOf(AIEditorError);

    readonly.readOnly = false;
    const proposal = await createAIProposal(readonly, provider(() => 'world'), { task: 'rewrite' }).promise;
    readonly.disabled = true;
    expect(() => applyAIProposal(readonly, proposal)).toThrowError(
      expect.objectContaining({ code: 'editor-locked' }),
    );
  });

  it('surfaces provider failures and leaves the document untouched', async () => {
    const editor = createEditor('hello', 0, 5);
    const onError = vi.fn();
    const task = createAIProposal(editor, provider(() => {
      throw new Error('provider offline');
    }, 'broken'), {
      task: 'grammar',
      onError,
    });

    await expect(task.promise).rejects.toMatchObject({ code: 'provider-error' });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(editor.getText()).toBe('hello');
  });
});
