// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest';
import { textPoint, textSelection, transaction } from '../../engine/src/index.js';
import { ARichTextElement } from '../../web-component/src/index.js';
import { ARichTextToolbarElement } from '../src/index.js';

function setup(): { editor: ARichTextElement; toolbar: ARichTextToolbarElement } {
  const editor = document.createElement('a-rich-text') as ARichTextElement;
  editor.id = 'editor';
  const toolbar = document.createElement('a-rich-text-toolbar') as ARichTextToolbarElement;
  toolbar.setAttribute('for', 'editor');
  document.body.append(editor, toolbar);
  return { editor, toolbar };
}

function button(toolbar: ARichTextToolbarElement, action: string): HTMLButtonElement {
  return toolbar.shadowRoot!.querySelector<HTMLButtonElement>(`button[data-action="${action}"]`)!;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('<a-rich-text-toolbar>', () => {
  it('binds to an editor by id and exposes accessible toolbar semantics', () => {
    const { editor, toolbar } = setup();
    const root = toolbar.shadowRoot!.querySelector<HTMLElement>('[role="toolbar"]')!;

    expect(toolbar.editor).toBe(editor);
    expect(root.getAttribute('aria-label')).toBe('Text formatting');
    expect(root.getAttribute('aria-controls')).toBe('editor');
    expect(button(toolbar, 'bold').getAttribute('aria-label')).toBe('Bold');
    expect(button(toolbar, 'bold').getAttribute('aria-pressed')).toBe('false');
  });

  it('reflects active marks and toggles them through editor commands', () => {
    const { editor, toolbar } = setup();
    editor.setText('hello');
    editor.dispatch(transaction().setSelection(
      textSelection(textPoint([0], 0), textPoint([0], 5)),
    ).build());

    const bold = button(toolbar, 'bold');
    expect(bold.getAttribute('aria-pressed')).toBe('false');
    bold.click();

    expect(editor.getHTML()).toBe('<p><strong>hello</strong></p>');
    expect(bold.getAttribute('aria-pressed')).toBe('true');
  });

  it('reflects block type and changes paragraph/heading through the select', () => {
    const { editor, toolbar } = setup();
    editor.setText('Title');
    editor.dispatch(transaction().setSelection(textSelection(textPoint([0], 2))).build());
    const select = toolbar.shadowRoot!.querySelector<HTMLSelectElement>('[data-role="block"]')!;

    expect(select.value).toBe('paragraph');
    select.value = 'h2';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(editor.getHTML()).toBe('<h2>Title</h2>');
    expect(select.value).toBe('h2');
  });

  it('reflects undo and redo availability', () => {
    const { editor, toolbar } = setup();
    editor.setText('hello');
    editor.dispatch(transaction().setSelection(
      textSelection(textPoint([0], 0), textPoint([0], 5)),
    ).build());

    const undo = button(toolbar, 'undo');
    const redo = button(toolbar, 'redo');
    expect(undo.disabled).toBe(true);
    expect(redo.disabled).toBe(true);

    button(toolbar, 'bold').click();
    expect(undo.disabled).toBe(false);
    expect(redo.disabled).toBe(true);

    undo.click();
    expect(redo.disabled).toBe(false);
  });

  it('disables editing controls when the editor is readonly', async () => {
    const { editor, toolbar } = setup();
    editor.readOnly = true;
    await Promise.resolve();

    expect(button(toolbar, 'bold').disabled).toBe(true);
    expect(toolbar.shadowRoot!.querySelector<HTMLSelectElement>('[data-role="block"]')!.disabled).toBe(true);
  });

  it('can bind directly without a for attribute', () => {
    const editor = document.createElement('a-rich-text') as ARichTextElement;
    const toolbar = document.createElement('a-rich-text-toolbar') as ARichTextToolbarElement;
    document.body.append(editor, toolbar);
    toolbar.editor = editor;

    expect(toolbar.editor).toBe(editor);
  });
});
