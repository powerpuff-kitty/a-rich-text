// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest';
import { textPoint, textSelection, transaction } from '../../engine/src/index.js';
import { ARichTextElement } from '../../web-component/src/index.js';
import { ARichTextToolbarElement } from '../src/index.js';

function setup(text = 'hello world') {
  const editor = document.createElement('a-rich-text') as ARichTextElement;
  editor.id = 'editor';
  document.body.append(editor);
  editor.setText(text);
  const toolbar = document.createElement('a-rich-text-toolbar') as ARichTextToolbarElement;
  toolbar.setAttribute('for', 'editor');
  document.body.prepend(toolbar);
  return { editor, toolbar };
}

function button(toolbar: ARichTextToolbarElement, action: string): HTMLButtonElement {
  return toolbar.shadowRoot!.querySelector<HTMLButtonElement>(`button[data-action="${action}"]`)!;
}

function click(element: HTMLElement): void {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.getSelection()?.removeAllRanges();
});

describe('@arichtext/ui advanced toolbar', () => {
  it('applies and removes a safe link through the inline link editor', () => {
    const { editor, toolbar } = setup();
    editor.dispatch(
      transaction()
        .setSelection(textSelection(textPoint([0], 6), textPoint([0], 11)))
        .build(),
    );
    toolbar.refresh();

    click(button(toolbar, 'link'));
    const form = toolbar.shadowRoot!.querySelector<HTMLFormElement>('[data-role="link-editor"]')!;
    const input = toolbar.shadowRoot!.querySelector<HTMLInputElement>('[data-role="link-input"]')!;
    expect(form.hidden).toBe(false);

    input.value = 'https://example.com';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(editor.getHTML()).toBe('<p>hello <a href="https://example.com">world</a></p>');
    expect(form.hidden).toBe(true);

    click(button(toolbar, 'link'));
    const remove = toolbar.shadowRoot!.querySelector<HTMLButtonElement>('[data-link-action="remove"]')!;
    click(remove);
    expect(editor.getHTML()).toBe('<p>hello world</p>');
  });

  it('keeps invalid link input visible with an accessible error state', () => {
    const { editor, toolbar } = setup();
    editor.dispatch(
      transaction()
        .setSelection(textSelection(textPoint([0], 0), textPoint([0], 5)))
        .build(),
    );
    toolbar.refresh();

    click(button(toolbar, 'link'));
    const form = toolbar.shadowRoot!.querySelector<HTMLFormElement>('[data-role="link-editor"]')!;
    const input = toolbar.shadowRoot!.querySelector<HTMLInputElement>('[data-role="link-input"]')!;
    const error = toolbar.shadowRoot!.querySelector<HTMLElement>('[data-role="link-error"]')!;
    input.value = 'javascript:alert(1)';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(form.hidden).toBe(false);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(error.textContent).toMatch(/unsafe|unsupported/i);
    expect(editor.getHTML()).toBe('<p>hello world</p>');
  });

  it('toggles bullet/list style buttons and pressed state from ART', () => {
    const { editor, toolbar } = setup('item');
    editor.dispatch(transaction().setSelection(textSelection(textPoint([0], 2))).build());
    toolbar.refresh();

    click(button(toolbar, 'bullet-list'));
    expect(editor.getJSON().content[0]).toMatchObject({ type: 'list', style: 'bullet' });
    expect(button(toolbar, 'bullet-list').getAttribute('aria-pressed')).toBe('true');

    click(button(toolbar, 'ordered-list'));
    expect(editor.getJSON().content[0]).toMatchObject({ type: 'list', style: 'ordered' });
    expect(button(toolbar, 'ordered-list').getAttribute('aria-pressed')).toBe('true');
    expect(button(toolbar, 'bullet-list').getAttribute('aria-pressed')).toBe('false');
  });

  it('inserts a table and enables contextual row/column controls', () => {
    const { editor, toolbar } = setup('hello');
    editor.dispatch(transaction().setSelection(textSelection(textPoint([0], 2))).build());
    toolbar.refresh();

    expect(button(toolbar, 'add-row').disabled).toBe(true);
    click(button(toolbar, 'insert-table'));
    expect(editor.getJSON().content[1]).toMatchObject({ type: 'table' });
    expect(button(toolbar, 'add-row').disabled).toBe(false);
    expect(button(toolbar, 'add-column').disabled).toBe(false);

    click(button(toolbar, 'add-row'));
    const table = editor.getJSON().content[1] as any;
    expect(table.content).toHaveLength(3);

    click(button(toolbar, 'add-column'));
    const updated = editor.getJSON().content[1] as any;
    expect(updated.content[0].content).toHaveLength(3);
  });

  it('disables structural controls while readonly', () => {
    const { editor, toolbar } = setup('hello');
    editor.dispatch(transaction().setSelection(textSelection(textPoint([0], 1))).build());
    editor.readOnly = true;
    toolbar.refresh();

    for (const action of ['bullet-list', 'ordered-list', 'task-list', 'insert-table', 'add-row', 'add-column']) {
      expect(button(toolbar, action).disabled).toBe(true);
    }
  });
});
