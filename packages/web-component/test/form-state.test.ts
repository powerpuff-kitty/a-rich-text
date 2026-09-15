// @vitest-environment happy-dom
import { beforeEach, expect, it } from 'vitest';
import { ARichTextElement } from '../src/index.js';
import { textPoint, textSelection, transaction } from '../../engine/src/index.js';

beforeEach(() => { document.body.innerHTML = ''; });

it('restores canonical form state independently of the current output format', () => {
  const editor = document.createElement('a-rich-text') as ARichTextElement;
  document.body.append(editor);
  editor.setHTML('<p><strong>saved</strong></p>');
  const saved = editor.serializeJSON();
  editor.format = 'text';
  editor.clear();
  editor.formStateRestoreCallback(saved);
  expect(editor.value).toBe('saved');
  expect(editor.getHTML()).toBe('<p><strong>saved</strong></p>');
});

it('excludes empty-block caret placeholders from native reconciliation and export', () => {
  const editor = document.createElement('a-rich-text') as ARichTextElement;
  document.body.append(editor);
  editor.setHTML('<table><tr><td><p></p></td></tr></table>');
  const before = editor.getJSON();
  const surface = editor.shadowRoot!.querySelector<HTMLElement>('[part="editor"]')!;
  expect(surface.querySelector('[data-art-placeholder]')).not.toBeNull();
  surface.dispatchEvent(new InputEvent('input', { bubbles: true }));
  expect(editor.getJSON()).toEqual(before);
  expect(editor.getHTML()).not.toContain('data-art-placeholder');
});

it('clears caret-only marks when the application moves the selection', () => {
  const editor = document.createElement('a-rich-text') as ARichTextElement;
  document.body.append(editor);
  editor.setText('hello');
  editor.dispatch(transaction().setSelection(textSelection(textPoint([0], 0))).build());
  editor.setMark({ type: 'bold' });
  expect(editor.isMarkActive('bold')).toBe(true);
  editor.dispatch(transaction().setSelection(textSelection(textPoint([0], 3))).build());
  expect(editor.isMarkActive('bold')).toBe(false);
});
