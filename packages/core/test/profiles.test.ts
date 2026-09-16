import { expect, it } from 'vitest';
import { createTextDocument, type ARTDocument } from '../src/index.js';
import { artJSONProfile, FormatProfileRegistry, type FormatProfile } from '../src/profiles.js';

it('round-trips ART JSON with explicit registration and isolated instances', () => {
  const registry = new FormatProfileRegistry(); registry.register(artJSONProfile);
  const doc = createTextDocument('Hello'); const exported = registry.export('art:json-v1', doc, 'json');
  expect(exported.ok).toBe(true);
  if (!exported.ok) throw new Error('Export failed');
  expect(registry.import('art:json-v1', exported.value)).toEqual({ ok: true, value: doc, diagnostics: [] });
  expect(new FormatProfileRegistry().list()).toEqual([]);
});
it('rejects duplicates and protects a replacement from stale disposal', () => {
  const registry = new FormatProfileRegistry(); const dispose = registry.register(artJSONProfile);
  expect(() => registry.register(artJSONProfile)).toThrow('Duplicate');
  dispose(); registry.register(artJSONProfile); dispose();
  expect(registry.list()).toHaveLength(1);
});
it('captures metadata at registration without exposing converter functions', () => {
  const registry = new FormatProfileRegistry(); const profile = { ...artJSONProfile };
  registry.register(profile); profile.label = 'Changed';
  expect(registry.list()).toEqual([{ id: 'art:json-v1', family: 'json', label: 'ART JSON', canImport: true, canExport: true }]);
});
it('rejects invalid registration metadata and unsupported directions', () => {
  const registry = new FormatProfileRegistry();
  for (const patch of [{ id: 'unnamespaced' }, { family: 'xml' }, { label: '' }, { import: 42 }, { import: undefined, export: undefined }]) {
    expect(() => registry.register({ ...artJSONProfile, ...patch } as FormatProfile)).toThrow();
  }
  registry.register({ id: 'acme:out-v1', family: 'text', label: 'Export only', export: () => ({ value: 'ok' }) });
  expect(registry.import('acme:out-v1', 'x')).toMatchObject({ ok: false, diagnostics: [{ code: 'unsupported-direction' }] });
  expect(registry.export('missing:v1', createTextDocument(''))).toMatchObject({ ok: false, diagnostics: [{ code: 'unknown-profile' }] });
  expect(registry.export('acme:out-v1', createTextDocument(''), 'json')).toMatchObject({ ok: false, diagnostics: [{ code: 'family-mismatch' }] });
});
it('rejects malformed JSON and invalid ART converter output', () => {
  const registry = new FormatProfileRegistry(); registry.register(artJSONProfile);
  for (const source of ['{', '{"ops":[]}', '{"type":"doc","version":2,"content":[]}']) expect(registry.import('art:json-v1', source).ok).toBe(false);
  registry.register({ id: 'acme:bad-v1', family: 'text', label: 'Bad', import: () => ({ value: {} as ARTDocument }) });
  expect(registry.import('acme:bad-v1', 'text').ok).toBe(false);
});
it('reports losses without applying them and blocks fatal diagnostics', () => {
  const registry = new FormatProfileRegistry(); const document = createTextDocument('Converted');
  registry.register({ id: 'acme:loss-v1', family: 'text', label: 'Lossy', import: () => ({ value: document, diagnostics: [{ code: 'style', message: 'Styles dropped', severity: 'loss' }] }) });
  const result = registry.import('acme:loss-v1', 'input');
  expect(result).toMatchObject({ ok: true, diagnostics: [{ severity: 'loss' }] });
  if (result.ok) { result.value.content.length = 0; expect(document.content).toHaveLength(1); }
  registry.register({ id: 'acme:fatal-v1', family: 'text', label: 'Fatal', import: () => ({ value: document, diagnostics: [{ code: 'node', message: 'Unsupported node', severity: 'error' }] }) });
  expect(registry.import('acme:fatal-v1', 'input')).toEqual({ ok: false, diagnostics: [{ code: 'node', message: 'Unsupported node', severity: 'error' }] });
});
it('isolates export mutations and rejects malformed output and converter exceptions', () => {
  const registry = new FormatProfileRegistry(); const original = createTextDocument('Keep');
  registry.register({ id: 'acme:mutating-v1', family: 'json', label: 'Mutation', export: doc => { doc.content.length = 0; return { value: '{' }; } });
  expect(registry.export('acme:mutating-v1', original).ok).toBe(false); expect(original.content).toHaveLength(1);
  registry.register({ id: 'acme:throws-v1', family: 'text', label: 'Throws', import: () => { throw new Error('Cannot convert'); } });
  expect(registry.import('acme:throws-v1', 'x')).toMatchObject({ ok: false, diagnostics: [{ message: 'Cannot convert' }] });
});
it('rejects malformed diagnostic records and asynchronous converters', () => {
  const registry = new FormatProfileRegistry();
  registry.register({ id: 'acme:notes-v1', family: 'text', label: 'Notes', import: () => ({ value: createTextDocument(''), diagnostics: [{ severity: 'unknown' }] }) } as unknown as FormatProfile);
  expect(registry.import('acme:notes-v1', 'x').ok).toBe(false);
  registry.register({ id: 'acme:async-v1', family: 'text', label: 'Async', export: () => Promise.resolve({ value: 'x' }) } as unknown as FormatProfile);
  expect(registry.export('acme:async-v1', createTextDocument('')).ok).toBe(false);
});
