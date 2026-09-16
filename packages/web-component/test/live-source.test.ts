// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ARichTextElement, detectInputFormat } from '../src/index.js';

beforeEach(() => { vi.useFakeTimers(); document.body.innerHTML = ''; });
afterEach(() => { document.body.replaceChildren(); vi.useRealTimers(); });
function setup() {
  const editor = document.createElement('a-rich-text') as ARichTextElement;
  document.body.append(editor);
  editor.views = 'html markdown json text'; editor.setText('Original');
  editor.sourceUpdate = 'auto'; editor.view = 'html';
  const source = editor.shadowRoot!.querySelector('textarea')!;
  const type = (value: string) => { source.value = value; source.dispatchEvent(new Event('input')); };
  return { editor, source, type };
}
it('applies after a pause without changing raw source, selection or emitting draft input', () => {
  const { editor, source, type } = setup();
  const input = vi.fn(); editor.addEventListener('input', input);
  const raw = '<p>  Hello <b>world</b></p>';
  type(raw); source.setSelectionRange(8, 8);
  vi.advanceTimersByTime(349); expect(editor.getText()).toBe('Original'); expect(input).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(editor.getText()).toContain('Hello'); expect(editor.sourceDirty).toBe(false);
  expect(source.value).toBe(raw); expect(source.selectionStart).toBe(8); expect(input).toHaveBeenCalledTimes(1);
  source.dispatchEvent(new Event('input')); expect(editor.sourceDirty).toBe(false);
});
it('retains invalid JSON and recovers automatically on a valid edit', () => {
  const { editor, source, type } = setup(); editor.view = 'json'; const valid = source.value;
  type('{'); vi.advanceTimersByTime(1000);
  expect(editor.getText()).toBe('Original'); expect(source.value).toBe('{'); expect(source.getAttribute('aria-invalid')).toBe('true');
  expect(editor.sourceDirty).toBe(true);
  type(valid.replace('Original', 'Recovered')); vi.advanceTimersByTime(350);
  expect(editor.getText()).toBe('Recovered'); expect(editor.sourceDirty).toBe(false);
});
it('waits for composition and flushes on blur', () => {
  const { editor, source, type } = setup();
  source.dispatchEvent(new Event('compositionstart')); type('<p>日本語</p>');
  vi.advanceTimersByTime(1000); expect(editor.getText()).toBe('Original');
  source.dispatchEvent(new Event('blur')); expect(editor.getText()).toBe('Original');
  source.dispatchEvent(new Event('compositionend')); source.dispatchEvent(new Event('blur'));
  expect(editor.getText()).toBe('日本語');
});
it('cancels pending updates while locked or disconnected and resumes on reconnect', () => {
  const { editor, type } = setup(); type('<p>Pending</p>'); editor.readOnly = true;
  vi.advanceTimersByTime(500); expect(editor.getText()).toBe('Original');
  editor.readOnly = false; editor.remove(); vi.advanceTimersByTime(500); expect(editor.getText()).toBe('Original');
  document.body.append(editor); vi.advanceTimersByTime(350); expect(editor.getText()).toBe('Pending');
});
it('does not replace a newer external document and cancels drafts on reset', () => {
  const { editor, type } = setup(); type('<p>Pending</p>'); editor.setText('External');
  vi.advanceTimersByTime(500); expect(editor.getText()).toBe('External'); expect(editor.sourceDirty).toBe(true);
  editor.formResetCallback(); vi.advanceTimersByTime(500); expect(editor.getText()).toBe(''); expect(editor.sourceDirty).toBe(false);
});
it('keeps manual mode explicit and formats through an optional hook', async () => {
  const { editor, source, type } = setup(); editor.sourceUpdate = 'manual';
  type('<p>Pending</p>'); vi.advanceTimersByTime(1000); expect(editor.getText()).toBe('Original');
  editor.sourceFormatter = text => text + '\n'; expect(await editor.formatSource()).toBe(true);
  expect(source.value).toBe('<p>Pending</p>\n'); expect(editor.getText()).toBe('Original');
  expect(editor.applySource()).toBe(true); expect(editor.getText()).toBe('Pending');
});
it('ignores late formatter output after typing, reset or disconnection', async () => {
  const { editor, source, type } = setup(); editor.sourceUpdate = 'manual';
  let resolve!: (value: string) => void;
  editor.sourceFormatter = () => new Promise<string>(r => { resolve = r; });
  const pending = editor.formatSource(); type('<p>New input</p>'); resolve('old');
  expect(await pending).toBe(false); expect(source.value).toBe('<p>New input</p>');
  const reset = editor.formatSource(); editor.formResetCallback(); resolve('old'); expect(await reset).toBe(false);
  const detached = editor.formatSource(); editor.remove(); resolve('old'); expect(await detached).toBe(false);
});
it('exposes formatter errors without destroying drafts', async () => {
  const { editor, source, type } = setup(); editor.sourceUpdate = 'manual'; type('<p>Draft</p>');
  editor.sourceFormatter = () => { throw new Error('Bad syntax'); };
  expect(await editor.formatSource()).toBe(false); expect(source.value).toBe('<p>Draft</p>'); expect(editor.getText()).toBe('Original');
});
it('validates ART JSON but only hints at foreign JSON profiles', () => {
  const { editor } = setup();
  expect(detectInputFormat(editor.serializeJSON())).toMatchObject({ profile: 'art-v1', supported: true, confidence: 'validated' });
  for (const [value, profile] of [['{"ops":[]}', 'quill-delta'], ['{"blocks":[]}', 'editorjs-blocks'], ['{"type":"doc"}', 'prosemirror'], ['{"root":{}}', 'lexical'], ['[{"children":[]}]', 'slate'], ['{"a":1}', 'unknown-json']]) {
    expect(detectInputFormat(value!)).toMatchObject({ profile, supported: false });
  }
  expect(detectInputFormat('{')).toMatchObject({ supported: false, confidence: 'ambiguous' });
  expect(detectInputFormat('Hello')).toMatchObject({ format: 'text', confidence: 'ambiguous', alternatives: ['markdown'] });
  expect(detectInputFormat('**Hello**').format).toBe('markdown');
  expect(detectInputFormat('[Hello](https://example.com)').format).toBe('markdown');
  expect(detectInputFormat('<p>Hello</p>').format).toBe('html');
});

it('keeps a conflicting draft dirty even when it matches previously accepted source', () => {
  const { editor, source, type } = setup(); const previous = source.value;
  type('<p>Pending</p>'); editor.setText('External'); type(previous);
  vi.advanceTimersByTime(500); expect(editor.sourceDirty).toBe(true); expect(editor.getText()).toBe('External');
});
it.each(['markdown', 'text'] as const)('automatically imports %s source', view => {
  const { editor, type } = setup(); editor.view = view;
  type(view === 'markdown' ? '**Updated**' : 'Updated'); vi.advanceTimersByTime(350);
  expect(editor.getText()).toBe('Updated'); expect(editor.sourceDirty).toBe(false);
});
it('recovers after reset interrupts composition', () => {
  const { editor, source, type } = setup();
  source.dispatchEvent(new Event('compositionstart')); type('Interrupted'); editor.formResetCallback();
  type('<p>After reset</p>'); vi.advanceTimersByTime(350); expect(editor.getText()).toBe('After reset');
});

it('lets async formatting finish before automatically importing the pending draft', async () => {
  const { editor, source, type } = setup();
  let resolve!: (value: string) => void;
  editor.sourceFormatter = () => new Promise<string>(r => { resolve = r; });
  type('<p>New</p>'); const pending = editor.formatSource();
  vi.advanceTimersByTime(500); expect(editor.getText()).toBe('Original');
  resolve('<p>New</p>\n'); expect(await pending).toBe(true);
  vi.advanceTimersByTime(350); expect(editor.getText()).toBe('New'); expect(source.value).toBe('<p>New</p>\n');
});
it('places fallback source actions beside the format selector, outside the content panel', () => {
  const { editor, type } = setup(); editor.sourceUpdate = 'manual'; type('<p>Draft</p>');
  const actions = editor.shadowRoot!.querySelector<HTMLElement>('[part="source-actions"]')!;
  expect(actions.closest('[part="view-switcher"]')).not.toBeNull();
  expect(editor.shadowRoot!.querySelector('[part="source-panel"] button')).toBeNull();
});

it('keeps automatic discard in place through formatting and disables it after saving', async () => {
  const { editor } = setup();
  const discard = editor.shadowRoot!.querySelector<HTMLButtonElement>('[data-source-action="discard"]')!;
  expect(editor.shadowRoot!.querySelector('[part="source-note"]')).toBeNull();
  expect(discard.hidden).toBe(false); expect(discard.disabled).toBe(true);
  editor.sourceFormatter = source => source + '\n';
  await editor.formatSource();
  expect(discard.hidden).toBe(false); expect(discard.disabled).toBe(false);
  vi.advanceTimersByTime(350);
  expect(discard.hidden).toBe(false); expect(discard.disabled).toBe(true);
});
