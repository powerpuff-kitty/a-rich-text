// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest';
import { ART_DOCUMENT_VERSION, type ARTDocument } from '../../core/src/index.js';
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

function beforeInput(target: HTMLElement, inputType: string): InputEvent {
  const event = new InputEvent('beforeinput', {
    inputType,
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

describe('<a-rich-text> structural input', () => {
  it('handles Enter through an engine block split', () => {
    const editor = createEditor();
    editor.setText('hello');
    editor.dispatch(transaction().setSelection(textSelection(textPoint([0], 2))).build());

    const event = beforeInput(surface(editor), 'insertParagraph');

    expect(event.defaultPrevented).toBe(true);
    expect(editor.getHTML()).toBe('<p>he</p><p>llo</p>');
  });

  it('handles Backspace as one grapheme deletion', () => {
    const editor = createEditor();
    const text = 'A👨‍👩‍👧‍👦B';
    editor.setText(text);
    editor.dispatch(transaction().setSelection(
      textSelection(textPoint([0], text.length - 1)),
    ).build());

    const event = beforeInput(surface(editor), 'deleteContentBackward');

    expect(event.defaultPrevented).toBe(true);
    expect(editor.getText()).toBe('AB');
  });

  it('joins paragraph siblings on Backspace at the start of the second block', () => {
    const editor = createEditor();
    editor.setHTML('<p>hello</p><p>world</p>');
    editor.dispatch(transaction().setSelection(textSelection(textPoint([1], 0))).build());

    const event = beforeInput(surface(editor), 'deleteContentBackward');

    expect(event.defaultPrevented).toBe(true);
    expect(editor.getHTML()).toBe('<p>helloworld</p>');
  });

  it('joins paragraph siblings on Delete at the end of the first block', () => {
    const editor = createEditor();
    editor.setHTML('<p>hello</p><p>world</p>');
    editor.dispatch(transaction().setSelection(textSelection(textPoint([0], 5))).build());

    const event = beforeInput(surface(editor), 'deleteContentForward');

    expect(event.defaultPrevented).toBe(true);
    expect(editor.getHTML()).toBe('<p>helloworld</p>');
  });

  it('falls back rather than joining across container boundaries', () => {
    const editor = createEditor();
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
    editor.setJSON(document);
    editor.dispatch(transaction().setSelection(textSelection(textPoint([1, 0], 0))).build());

    const event = beforeInput(surface(editor), 'deleteContentBackward');

    expect(event.defaultPrevented).toBe(false);
    expect(editor.getJSON()).toEqual(document);
  });

  it('does not intercept word deletion until word semantics are implemented', () => {
    const editor = createEditor();
    editor.setText('two words');
    editor.dispatch(transaction().setSelection(textSelection(textPoint([0], 9))).build());

    const event = beforeInput(surface(editor), 'deleteWordBackward');

    expect(event.defaultPrevented).toBe(false);
    expect(editor.getText()).toBe('two words');
  });
});
