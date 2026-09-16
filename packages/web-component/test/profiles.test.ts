// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { createTextDocument, toPlainText } from '@arichtext/core';
import { ARichTextElement, type FormatProfile } from '../src/index.js';
afterEach(() => { document.body.replaceChildren(); vi.useRealTimers(); });
const article: FormatProfile = {
  id: 'acme:article-v1', family: 'json', label: 'Article JSON',
  import: source => ({ value: createTextDocument(JSON.parse(source).body) }),
  export: doc => ({ value: JSON.stringify({ body: toPlainText(doc) }) }),
};
function setup() {
  const editor = document.createElement('a-rich-text') as ARichTextElement;
  document.body.append(editor); editor.views = 'html json text'; editor.setText('Original');
  editor.registerFormatProfile(article);
  const source = editor.shadowRoot!.querySelector('textarea')!;
  const type = (value: string) => { source.value = value; source.dispatchEvent(new Event('input')); };
  return { editor, source, type };
}
it('selects allowlisted custom source independently of output and applies edits', () => {
  const { editor, source, type } = setup();
  editor.profiles = ['art:html-v1', article.id]; editor.sourceProfile = article.id;
  expect(editor.view).toBe('json'); expect(JSON.parse(source.value)).toEqual({ body: 'Original' });
  expect(editor.value).toBe('<p>Original</p>');
  type('{"body":"Updated"}'); expect(editor.applySource()).toBe(true); expect(editor.getText()).toBe('Updated');
  const select = editor.shadowRoot!.querySelector('a-rich-text-select')!;
  expect(select.options.map(option => option.value)).toEqual(['visual', 'art:html-v1', article.id]);
});
it('uses the output profile for value imports and exports', () => {
  const { editor } = setup(); editor.format = 'json'; editor.profile = article.id;
  expect(JSON.parse(editor.value)).toEqual({ body: 'Original' }); editor.value = '{"body":"Imported"}';
  expect(editor.getText()).toBe('Imported');
  expect(editor.importProfile(article.id, '{"body":"Preview"}').ok).toBe(true);
  expect(editor.getText()).toBe('Imported');
});
it('preserves dirty drafts across profile selection and referenced disposal', () => {
  const { editor, source, type } = setup(); editor.sourceProfile = article.id; type('{');
  editor.sourceProfile = 'art:html-v1'; expect(editor.sourceProfile).toBe(article.id); expect(source.value).toBe('{');
  editor.selectView('visual'); expect(editor.view).toBe('json');
  const release = editor.registerFormatProfile({ ...article, id: 'acme:other-v1' });
  editor.profiles = ['acme:other-v1']; expect(editor.hasAttribute('profiles')).toBe(false);
  release(); expect(editor.sourceDirty).toBe(true);
});
it('blocks unknown configurations and recovers after registration or correction', () => {
  const { editor } = setup(); editor.sourceProfile = 'acme:missing-v1';
  expect(editor.shadowRoot!.querySelector<HTMLElement>('[part="profile-error"]')!.hidden).toBe(false);
  editor.registerFormatProfile({ ...article, id: 'acme:missing-v1' });
  expect(editor.shadowRoot!.querySelector<HTMLElement>('[part="profile-error"]')!.hidden).toBe(true);
  expect(editor.view).toBe('json');
  editor.profile = article.id; // HTML output and JSON profile mismatch.
  expect(() => editor.value).toThrow(); editor.format = 'json';
  expect(JSON.parse(editor.value)).toEqual({ body: 'Original' });
});
it('makes export-only source read-only and prevents removal while referenced', () => {
  const { editor, source } = setup();
  const release = editor.registerFormatProfile({ ...article, id: 'acme:export-v1', import: undefined });
  editor.sourceProfile = 'acme:export-v1'; expect(source.readOnly).toBe(true);
  expect(editor.applySource()).toBe(false); expect(() => release()).toThrow('references');
  editor.removeAttribute('source-profile'); release();
});
it('holds lossy automatic imports for explicit confirmation', () => {
  vi.useFakeTimers(); const { editor, type } = setup();
  editor.registerFormatProfile({ ...article, id: 'acme:loss-v1', import: source => ({ ...article.import!(source), diagnostics: [{ code: 'style', message: 'Styles will be removed', severity: 'loss' }] }) });
  editor.sourceProfile = 'acme:loss-v1'; editor.sourceUpdate = 'auto'; type('{"body":"Lossy"}');
  vi.advanceTimersByTime(350); expect(editor.getText()).toBe('Original'); expect(editor.sourceDirty).toBe(true);
  expect(editor.sourceDiagnostics[0]?.severity).toBe('loss'); expect(editor.applySource()).toBe(false);
  expect(editor.applySource(true)).toBe(true); expect(editor.getText()).toBe('Lossy');
});
it('rejects lossy output unless the developer explicitly allows it', () => {
  const { editor } = setup(); editor.registerFormatProfile({ ...article, id: 'acme:loss-v1', export: doc => ({ ...article.export!(doc), diagnostics: [{ code: 'style', message: 'Styles removed', severity: 'loss' }] }) });
  editor.format = 'json'; editor.profile = 'acme:loss-v1'; expect(() => editor.value).toThrow('Styles removed');
  editor.setAttribute('profile-loss', 'allow'); expect(JSON.parse(editor.value)).toEqual({ body: 'Original' });
});
it('returns to built-in JSON after clearing an explicit custom source profile', () => {
  const { editor, source } = setup(); editor.sourceProfile = article.id;
  editor.selectView('json'); expect(JSON.parse(source.value).type).toBe('doc');
});
it('waits for a declarative output profile registration before importing the initial value', () => {
  const editor = document.createElement('a-rich-text') as ARichTextElement;
  editor.format = 'json'; editor.setAttribute('value', '{"body":"Initial"}'); editor.profile = article.id;
  document.body.append(editor); expect(editor.getText()).toBe('');
  editor.registerFormatProfile(article); expect(editor.getText()).toBe('Initial');
});
it('keeps visual mode when registering another profile or reconnecting', () => {
  const { editor } = setup(); editor.sourceProfile = article.id; editor.view = 'visual';
  editor.registerFormatProfile({ ...article, id: 'acme:second-v1' }); expect(editor.view).toBe('visual');
  editor.remove(); document.body.append(editor); expect(editor.view).toBe('visual');
});
it('resets custom-profile forms without an initial value to an empty document', () => {
  const { editor } = setup(); editor.format = 'json'; editor.profile = article.id;
  editor.formResetCallback(); expect(editor.getText()).toBe(''); expect(JSON.parse(editor.value)).toEqual({ body: '' });
});
it('retains export-loss diagnostics until source import is explicitly accepted', () => {
  const { editor, type } = setup();
  editor.registerFormatProfile({ ...article, id: 'acme:flatten-v1', export: doc => ({ ...article.export!(doc), diagnostics: [{ code: 'flatten', severity: 'loss', message: 'Formatting removed from source' }] }) });
  editor.sourceProfile = 'acme:flatten-v1'; type('{"body":"Changed"}');
  expect(editor.applySource()).toBe(false); expect(editor.getText()).toBe('Original');
  expect(editor.applySource(true)).toBe(true); expect(editor.getText()).toBe('Changed');
});
it('resolves initial source profiles regardless of attribute order', () => {
  const editor = document.createElement('a-rich-text') as ARichTextElement;
  editor.sourceProfile = 'art:json-v1'; editor.views = 'json'; document.body.append(editor);
  expect(editor.view).toBe('json');
  expect(JSON.parse(editor.shadowRoot!.querySelector('textarea')!.value).type).toBe('doc');
});
it('direct family attribute changes leave incompatible custom profiles cleanly', () => {
  const { editor, source } = setup(); editor.sourceProfile = article.id;
  editor.setAttribute('view', 'html'); expect(editor.sourceProfile).toBe('art:html-v1');
  expect(source.value).toBe('<p>Original</p>');
});
it('reports invalid value attributes without replacing canonical content and recovers', () => {
  const { editor } = setup(); editor.format = 'json'; editor.profile = article.id;
  editor.setAttribute('value', '{'); expect(editor.getText()).toBe('Original');
  expect(editor.shadowRoot!.querySelector<HTMLElement>('[part="profile-error"]')!.hidden).toBe(false);
  editor.setAttribute('value', '{"body":"Recovered"}'); expect(editor.getText()).toBe('Recovered');
  expect(editor.shadowRoot!.querySelector<HTMLElement>('[part="profile-error"]')!.hidden).toBe(true);
});
it('rejects an explicitly empty output profile instead of silently using HTML', () => {
  const { editor } = setup(); editor.profile = '';
  expect(() => editor.value).toThrow('Unknown format profile');
  expect(() => { editor.value = '<p>Wrong</p>'; }).toThrow('Unknown format profile');
  expect(editor.getText()).toBe('Original');
});
