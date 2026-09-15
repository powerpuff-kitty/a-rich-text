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

function paste(target: HTMLElement, data: Record<string, string>): Event {
  const event = new Event('paste', {
    bubbles: true,
    composed: true,
    cancelable: true,
  }) as ClipboardEvent;
  Object.defineProperty(event, 'clipboardData', {
    configurable: true,
    value: {
      types: Object.keys(data),
      getData(format: string) {
        return data[format] ?? '';
      },
    },
  });
  target.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.getSelection()?.removeAllRanges();
});

describe('<a-rich-text> paste', () => {
  it('sanitizes rich HTML before inserting it as an ART transaction', () => {
    const editor = createEditor();
    editor.setText('AAZZ');
    editor.dispatch(transaction().setSelection(textSelection(textPoint([0], 2))).build());

    const event = paste(surface(editor), {
      'text/html': '<p><span style="font-weight:700">BB</span><script>alert(1)</script></p><p>CC</p>',
      'text/plain': 'BB\nCC',
    });

    expect(event.defaultPrevented).toBe(true);
    expect(editor.getHTML()).toBe('<p>AA<strong>BB</strong></p><p>CCZZ</p>');
    expect(editor.getHTML()).not.toContain('script');
    expect(editor.canUndo).toBe(true);
  });

  it('pastes literal multiline plain text as paragraphs', () => {
    const editor = createEditor();
    editor.setText('AZ');
    editor.dispatch(transaction().setSelection(textSelection(textPoint([0], 1))).build());

    paste(surface(editor), { 'text/plain': '# one\n**two**' });

    expect(editor.getHTML()).toBe('<p>A# one</p><p>**two**Z</p>');
  });

  it('makes paste undoable as one engine transaction', () => {
    const editor = createEditor();
    editor.setText('AZ');
    editor.dispatch(transaction().setSelection(textSelection(textPoint([0], 1))).build());

    paste(surface(editor), { 'text/plain': 'middle' });
    expect(editor.getText()).toBe('AmiddleZ');
    expect(editor.undo()).toBe(true);
    expect(editor.getText()).toBe('AZ');
  });

  it('rejects cross-block paste instead of inserting raw clipboard HTML', () => {
    const editor = createEditor();
    editor.setHTML('<p>one</p><p>two</p>');
    editor.dispatch(transaction().setSelection(
      textSelection(textPoint([0], 1), textPoint([1], 2)),
    ).build());
    const error = vi.fn();
    editor.addEventListener('error', error);

    const event = paste(surface(editor), { 'text/html': '<p><strong>paste</strong></p>' });

    expect(event.defaultPrevented).toBe(true);
    expect(editor.getHTML()).toBe('<p>one</p><p>two</p>');
    expect(error).toHaveBeenCalledTimes(1);
    expect((error.mock.calls[0]![0] as CustomEvent).detail.context).toBe('paste-unsupported-selection');
  });

  it('rejects unsupported non-text payloads explicitly', () => {
    const editor = createEditor();
    editor.setText('safe');
    editor.dispatch(transaction().setSelection(textSelection(textPoint([0], 4))).build());
    const error = vi.fn();
    editor.addEventListener('error', error);

    const event = paste(surface(editor), { 'image/png': '' });

    expect(event.defaultPrevented).toBe(true);
    expect(editor.getText()).toBe('safe');
    expect((error.mock.calls[0]![0] as CustomEvent).detail.context).toBe('paste-unsupported-payload');
  });
});
