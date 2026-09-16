// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest';
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

function shortcut(target: HTMLElement, key: string, options: Partial<KeyboardEventInit> = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    ctrlKey: true,
    bubbles: true,
    composed: true,
    cancelable: true,
    ...options,
  });
  target.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.getSelection()?.removeAllRanges();
});

describe('<a-rich-text> commands and shortcuts', () => {
  it('exposes selection, active marks and active block queries', () => {
    const editor = createEditor();
    editor.setHTML('<h2><strong>hello</strong></h2>');
    editor.dispatch(transaction().setSelection(
      textSelection(textPoint([0], 0), textPoint([0], 5)),
    ).build());

    expect(editor.getSelection()).toEqual(textSelection(textPoint([0], 0), textPoint([0], 5)));
    expect(editor.getActiveMarks()).toEqual([{ type: 'bold' }]);
    expect(editor.isMarkActive('bold')).toBe(true);
    expect(editor.getActiveBlock()).toEqual({ type: 'heading', level: 2 });
  });

  it('provides convenience formatting and block commands', () => {
    const editor = createEditor();
    editor.setText('hello');
    editor.dispatch(transaction().setSelection(
      textSelection(textPoint([0], 0), textPoint([0], 5)),
    ).build());

    expect(editor.toggleMark('italic')).toBe(true);
    expect(editor.getHTML()).toBe('<p><em>hello</em></p>');
    expect(editor.setHeading(2)).toBe(true);
    expect(editor.getHTML()).toBe('<h2><em>hello</em></h2>');
    expect(editor.setParagraph()).toBe(true);
    expect(editor.getHTML()).toBe('<p><em>hello</em></p>');
  });

  it('tracks canUndo/canRedo through editor commands', () => {
    const editor = createEditor();
    editor.setText('hello');
    editor.dispatch(transaction().setSelection(
      textSelection(textPoint([0], 0), textPoint([0], 5)),
    ).build());

    expect(editor.canUndo).toBe(false);
    editor.toggleMark('bold');
    expect(editor.canUndo).toBe(true);
    expect(editor.canRedo).toBe(false);
    editor.undo();
    expect(editor.canRedo).toBe(true);
  });

  it('handles Mod+B/I/U without execCommand', () => {
    const editor = createEditor();
    editor.setText('text');
    editor.dispatch(transaction().setSelection(
      textSelection(textPoint([0], 0), textPoint([0], 4)),
    ).build());
    const editable = surface(editor);

    expect(shortcut(editable, 'b').defaultPrevented).toBe(true);
    expect(editor.isMarkActive('bold')).toBe(true);
    expect(shortcut(editable, 'i').defaultPrevented).toBe(true);
    expect(editor.isMarkActive('italic')).toBe(true);
    expect(shortcut(editable, 'u').defaultPrevented).toBe(true);
    expect(editor.isMarkActive('underline')).toBe(true);
  });

  it('handles Mod+Z and Mod+Shift+Z through engine history', () => {
    const editor = createEditor();
    editor.setText('text');
    editor.dispatch(transaction().setSelection(
      textSelection(textPoint([0], 0), textPoint([0], 4)),
    ).build());
    editor.toggleMark('bold');
    const editable = surface(editor);

    expect(shortcut(editable, 'z').defaultPrevented).toBe(true);
    expect(editor.isMarkActive('bold')).toBe(false);
    expect(shortcut(editable, 'z', { shiftKey: true }).defaultPrevented).toBe(true);
    expect(editor.isMarkActive('bold')).toBe(true);
  });

  it('does not run shortcuts while readonly', () => {
    const editor = createEditor();
    editor.setText('text');
    editor.readOnly = true;
    editor.dispatch(transaction().setSelection(
      textSelection(textPoint([0], 0), textPoint([0], 4)),
    ).build());

    const event = shortcut(surface(editor), 'b');
    expect(event.defaultPrevented).toBe(false);
    expect(editor.isMarkActive('bold')).toBe(false);
  });
});

it('clears caret formatting for subsequent typing and guards authoring methods when locked', () => {
  const editor = createEditor();
  editor.setHTML('<p><strong>hello</strong></p>');
  editor.dispatch(transaction().setSelection(textSelection(textPoint([0], 5))).build());
  expect(editor.clearFormatting()).toBe(true);
  expect(editor.getActiveMarks()).toEqual([]);
  surface(editor).dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: '!', bubbles: true, cancelable: true }));
  expect(editor.getHTML()).toBe('<p><strong>hello</strong>!</p>');
  editor.readOnly = true;
  expect(editor.toggleBlockquote()).toBe(false);
  expect(editor.insertHorizontalRule()).toBe(false);
  expect(editor.clearFormatting()).toBe(false);
});
