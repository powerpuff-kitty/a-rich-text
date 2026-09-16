// @vitest-environment happy-dom
import { beforeEach, expect, it } from 'vitest';
import { ARichTextElement } from '../src/index.js';

beforeEach(() => { document.body.innerHTML = ''; });
function setup() {
  const editor = document.createElement('a-rich-text') as ARichTextElement;
  document.body.append(editor);
  editor.views = 'html md json text';
  editor.setHTML('<p><strong>Hello</strong></p>');
  return editor;
}
function draft(editor: ARichTextElement, value: string) {
  const source = editor.shadowRoot!.querySelector<HTMLTextAreaElement>('[part="source"]')!;
  source.value = value;
  source.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
}

it('filters configured views/tools and keeps submission format independent', () => {
  const editor = setup();
  editor.views = 'md json unsupported json';
  editor.tools = 'bold,link unknown';
  expect(editor.views).toEqual(['visual', 'markdown', 'json']);
  expect(editor.tools).toEqual(['bold', 'link']);
  editor.view = 'markdown';
  expect(editor.format).toBe('html');
  expect(editor.value).toBe('<p><strong>Hello</strong></p>');
  expect(editor.shadowRoot!.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('**Hello**');
  editor.view = 'html';
  expect(editor.view).toBe('visual');
});

it('keeps invalid JSON drafts without mutating canonical data or emitting input', () => {
  const editor = setup();
  editor.view = 'json';
  let inputs = 0;
  editor.addEventListener('input', () => inputs++);
  draft(editor, '{bad json');
  expect(editor.sourceDirty).toBe(true);
  expect(inputs).toBe(0);
  expect(editor.applySource()).toBe(false);
  expect(editor.getText()).toBe('Hello');
  editor.view = 'visual';
  expect(editor.view).toBe('json');
  expect(editor.shadowRoot!.querySelector('textarea')!.value).toBe('{bad json');
  editor.discardSource();
  editor.view = 'visual';
  expect(editor.view).toBe('visual');
  expect(editor.sourceDirty).toBe(false);
});

it('applies sanitized HTML explicitly, and switching unmodified formats is lossless', () => {
  const editor = setup();
  const before = editor.getJSON();
  for (const view of ['html', 'markdown', 'json', 'text', 'visual'] as const) editor.view = view;
  expect(editor.getJSON()).toEqual(before);
  editor.view = 'html';
  draft(editor, '<p><em>safe</em><script>alert(1)</script></p>');
  expect(editor.getText()).toBe('Hello');
  expect(editor.applySource()).toBe(true);
  expect(editor.getHTML()).toBe('<p><em>safe</em></p>');
});

it('rejects stale source drafts after an external document update', () => {
  const editor = setup();
  editor.view = 'markdown';
  draft(editor, 'draft');
  editor.setText('external update');
  expect(editor.applySource()).toBe(false);
  expect(editor.getText()).toBe('external update');
  editor.discardSource();
  expect(editor.shadowRoot!.querySelector('textarea')!.value).toBe('external update');
});

it('retains drafts when allowed views change and respects readonly apply', () => {
  const editor = setup();
  editor.view = 'json';
  draft(editor, '{}');
  editor.views = 'html';
  expect(editor.view).toBe('json');
  expect(editor.views).toContain('json');
  editor.readOnly = true;
  expect(editor.applySource()).toBe(false);
  editor.formResetCallback();
  expect(editor.sourceDirty).toBe(false);
});
