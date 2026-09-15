// @vitest-environment happy-dom
import { beforeEach, expect, it } from 'vitest';
import { transaction, textPoint, textSelection } from '../../engine/src/index.js';
import { ARichTextElement, enableStandardEditing } from '../src/index.js';

beforeEach(() => { document.body.innerHTML = ''; });

it('exposes standard commands, honors locked state and stops after disposal', () => {
  const editor = document.createElement('a-rich-text') as ARichTextElement;
  document.body.append(editor);
  const controller = enableStandardEditing(editor);
  expect(enableStandardEditing(editor)).toBe(controller);
  editor.setText('hello');
  editor.dispatch(transaction().setSelection(textSelection(textPoint([0], 0), textPoint([0], 5))).build());
  expect(controller.setLink('https://example.com')).toBe(true);
  expect(editor.getHTML()).toContain('<a href="https://example.com">hello</a>');
  expect(controller.removeLink()).toBe(true);
  expect(controller.toggleList('task')).toBe(true);
  expect(controller.setTaskChecked(true)).toBe(true);
  expect(editor.getJSON().content[0]).toMatchObject({ type: 'list', content: [{ checked: true }] });
  editor.readOnly = true;
  const before = editor.getJSON();
  expect(controller.toggleList('bullet')).toBe(false);
  expect(controller.insertTable()).toBe(false);
  expect(controller.setLink('https://example.com')).toBe(false);
  expect(editor.getJSON()).toEqual(before);
  editor.readOnly = false;
  controller.destroy();
  controller.destroy();
  expect(controller.toggleList('bullet')).toBe(false);
  expect(enableStandardEditing(editor)).not.toBe(controller);
});
