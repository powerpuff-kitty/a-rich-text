// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import { ARichTextElement } from '../../web-component/src/index.js';
import { ARichTextToolbarElement } from '../src/index.js';

afterEach(() => { document.body.innerHTML = ''; });

it('keeps a keyboard-opened inline toolbar visible during delayed selection updates', () => {
  const editor = document.createElement('a-rich-text') as ARichTextElement;
  editor.id = 'editor';
  const toolbar = document.createElement('a-rich-text-toolbar') as ARichTextToolbarElement;
  toolbar.setAttribute('for', 'editor'); toolbar.setAttribute('mode', 'inline');
  document.body.append(editor, toolbar);
  editor.setText('Text'); editor.focus();
  editor.dispatch({ operations: [], selection: { anchor: { blockPath: [0], offset: 1 }, head: { blockPath: [0], offset: 1 } } });
  const popup = toolbar.shadowRoot!.querySelector<HTMLElement>('[role=toolbar]')!;
  expect(popup.hidden).toBe(true);
  editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', altKey: true, bubbles: true, composed: true }));
  expect(popup.hidden).toBe(false);
  expect(popup.contains(toolbar.shadowRoot!.activeElement)).toBe(true);
  // The browser can deliver the click's selection update after keyboard focus moved.
  editor.dispatchEvent(new CustomEvent('selection-change', { bubbles: true, composed: true }));
  expect(popup.hidden).toBe(false);
  editor.focus();
  editor.dispatchEvent(new CustomEvent('selection-change', { bubbles: true, composed: true }));
  expect(popup.hidden).toBe(true);
});

it('keeps the toolbar open when editor blur reports a selection during focus transfer', () => {
  const editor = document.createElement('a-rich-text') as ARichTextElement;
  editor.id = 'editor';
  const toolbar = document.createElement('a-rich-text-toolbar') as ARichTextToolbarElement;
  toolbar.setAttribute('for', 'editor'); toolbar.setAttribute('mode', 'inline');
  document.body.append(editor, toolbar);
  editor.setText('Text'); editor.focus();
  editor.dispatch({ operations: [], selection: { anchor: { blockPath: [0], offset: 1 }, head: { blockPath: [0], offset: 1 } } });
  editor.shadowRoot!.querySelector('[part=editor]')!.addEventListener('blur', () => {
    editor.dispatchEvent(new CustomEvent('selection-change', { bubbles: true, composed: true }));
  }, { once: true });
  editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', altKey: true, bubbles: true, composed: true }));
  const popup = toolbar.shadowRoot!.querySelector<HTMLElement>('[role=toolbar]')!;
  expect(popup.hidden).toBe(false);
  expect(popup.contains(toolbar.shadowRoot!.activeElement)).toBe(true);
});
