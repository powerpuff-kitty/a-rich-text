// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import { ARichTextElement, ARichTextSelectElement, defineARichText, defineARichTextSelect } from '../../web-component/src/index.js';
import { ARichTextToolbarElement, ARichTextShellElement, defineARichTextToolbar, defineARichTextShell } from '../src/index.js';
afterEach(() => { document.body.replaceChildren(); });

it('registers independent short constructors that retain the original APIs and types', () => {
  const pairs = [['art-editor', ARichTextElement], ['art-select', ARichTextSelectElement], ['art-toolbar', ARichTextToolbarElement], ['art-shell', ARichTextShellElement]] as const;
  for (const [tag, base] of pairs) expect(document.createElement(tag)).toBeInstanceOf(base);
  const editor = document.createElement('art-editor'); editor.setText('Short tag'); expect(editor.getText()).toBe('Short tag');
  expect((editor.constructor as typeof ARichTextElement).formAssociated).toBe(true);
});
it.each([['art-editor', 'art-toolbar'], ['art-editor', 'a-rich-text-toolbar'], ['a-rich-text', 'art-toolbar']])('links %s with %s and follows shell presets', async (editorTag, toolbarTag) => {
  const shell = document.createElement('art-shell');
  const editor = document.createElement(editorTag) as ARichTextElement; editor.id = 'mixed'; editor.preset = 'document';
  const toolbar = document.createElement(toolbarTag) as ARichTextToolbarElement; toolbar.setAttribute('for', 'mixed');
  shell.append(toolbar, editor); document.body.append(shell); await Promise.resolve();
  expect(toolbar.editor === editor).toBe(true); expect(shell.dataset.preset).toBe('document');
  editor.preset = 'minimal'; await new Promise(resolve => setTimeout(resolve, 0)); expect(shell.dataset.preset).toBe('minimal');
});
it('allows idempotent custom registrations without reusing a registered constructor', () => {
  for (const [define, tag] of [[defineARichText, 'test-art-editor'], [defineARichTextToolbar, 'test-art-toolbar'], [defineARichTextSelect, 'test-art-select'], [defineARichTextShell, 'test-art-shell']] as const) {
    expect(() => { define(tag); define(tag); }).not.toThrow();
    expect(document.createElement(tag).shadowRoot).not.toBeNull();
  }
});
