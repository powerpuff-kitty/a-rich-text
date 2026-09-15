// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { textPoint, textSelection, transaction } from '../../engine/src/index.js';
import { ARichTextElement } from '../src/index.js';

function createEditor(): ARichTextElement {
  const editor = document.createElement('a-rich-text') as ARichTextElement;
  document.body.append(editor);
  return editor;
}

function surface(editor: ARichTextElement): HTMLDivElement {
  return editor.shadowRoot!.querySelector<HTMLDivElement>('[part="editor"]')!;
}

function beforeInput(target: HTMLElement, inputType: string, data: string | null = null): InputEvent {
  const event = new InputEvent('beforeinput', {
    inputType,
    data,
    bubbles: true,
    composed: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.getSelection()?.removeAllRanges();
});

describe('<a-rich-text> engine integration', () => {
  it('keeps ART state canonical until native DOM mutation is reconciled', () => {
    const editor = createEditor();
    editor.setHTML('<p>Canonical</p>');
    const editable = surface(editor);

    editable.innerHTML = '<p>DOM only</p>';
    expect(editor.getText()).toBe('Canonical');

    editable.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
    expect(editor.getText()).toBe('DOM only');
    expect(editable.querySelector('[data-art-block-path="0"]')).not.toBeNull();
  });

  it('routes supported text insertion through engine transactions', () => {
    const editor = createEditor();
    editor.setText('abc');
    editor.dispatch(transaction().setSelection(textSelection(textPoint([0], 3))).build());

    const transactionListener = vi.fn();
    editor.addEventListener('transaction', transactionListener);
    const event = beforeInput(surface(editor), 'insertText', 'X');

    expect(event.defaultPrevented).toBe(true);
    expect(editor.getText()).toBe('abcX');
    expect(transactionListener).toHaveBeenCalledTimes(1);
  });

  it('applies formatting intents through ART transactions', () => {
    const editor = createEditor();
    editor.setText('bold');
    editor.dispatch(transaction().setSelection(
      textSelection(textPoint([0], 0), textPoint([0], 4)),
    ).build());

    const event = beforeInput(surface(editor), 'formatBold');

    expect(event.defaultPrevented).toBe(true);
    expect(editor.getHTML()).toBe('<p><strong>bold</strong></p>');
  });

  it('supports stored marks for formatting at a collapsed caret', () => {
    const editor = createEditor();
    editor.setText('a');
    editor.dispatch(transaction().setSelection(textSelection(textPoint([0], 1))).build());

    expect(beforeInput(surface(editor), 'formatBold').defaultPrevented).toBe(true);
    expect(beforeInput(surface(editor), 'insertText', 'b').defaultPrevented).toBe(true);

    expect(editor.getHTML()).toBe('<p>a<strong>b</strong></p>');
  });

  it('routes browser history intents through engine undo and redo', () => {
    const editor = createEditor();
    editor.setText('abc');
    editor.dispatch(transaction().setSelection(textSelection(textPoint([0], 3))).build());
    beforeInput(surface(editor), 'insertText', 'X');

    expect(editor.getText()).toBe('abcX');
    expect(beforeInput(surface(editor), 'historyUndo').defaultPrevented).toBe(true);
    expect(editor.getText()).toBe('abc');
    expect(beforeInput(surface(editor), 'historyRedo').defaultPrevented).toBe(true);
    expect(editor.getText()).toBe('abcX');
  });

  it('does not reconcile DOM mutations in the middle of composition', async () => {
    const editor = createEditor();
    editor.setText('a');
    const editable = surface(editor);
    const paragraph = editable.querySelector('p')!;

    editable.dispatchEvent(new Event('compositionstart', { bubbles: true, composed: true }));
    paragraph.textContent = 'あ';
    editable.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));

    expect(editor.getText()).toBe('a');

    editable.dispatchEvent(new Event('compositionend', { bubbles: true, composed: true }));
    await Promise.resolve();

    expect(editor.getText()).toBe('あ');
  });

  it('prevents engine edits while readonly', () => {
    const editor = createEditor();
    editor.setText('locked');
    editor.readOnly = true;
    editor.dispatch(transaction().setSelection(textSelection(textPoint([0], 6))).build());

    const event = beforeInput(surface(editor), 'insertText', '!');
    expect(event.defaultPrevented).toBe(true);
    expect(editor.getText()).toBe('locked');
  });
});
