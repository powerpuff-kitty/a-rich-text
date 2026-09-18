import { it, expect } from 'vitest';
import { exportQuillDelta, importQuillDelta } from '../src/index.js';

it('reports inline extension fallback loss explicitly', () => {
  const result = exportQuillDelta({ type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'extensionInline', name: 'acme:mention', fallbackText: '@Alice', attrs: { id: 42 } }] }] });
  expect(JSON.parse(result.value).ops).toEqual([{ insert: '@Alice\n' }]);
  expect(result.diagnostics).toContainEqual({ code: 'extension-inline', severity: 'loss', message: 'Inline extensions become fallback text' });
});

it('imports and exports Quill image embeds while diagnosing unsupported embeds', () => {
  const imported = importQuillDelta(JSON.stringify({ ops: [{ insert: { image: 'https://example.com/a.png' } }, { insert: '\n' }, { insert: { video: 'https://example.com/v' } }, { insert: '\n' }] }));
  expect(imported.value.content[0]).toMatchObject({ type: 'image', src: 'https://example.com/a.png' });
  expect(imported.diagnostics).toContainEqual(expect.objectContaining({ code: 'adapter-embed' }));
  const exported = exportQuillDelta({ type: 'doc', version: 1, content: [{ type: 'image', src: 'https://example.com/a.png' }] });
  expect(JSON.parse(exported.value).ops[0]).toEqual({ insert: { image: 'https://example.com/a.png' } });
});

it('maps Quill inline color, background and script formats', () => {
  const imported = importQuillDelta(JSON.stringify({ ops: [{ insert: 'H2O', attributes: { color: '#f00', background: '#000', script: 'sub' } }, { insert: '\n' }] }));
  expect(imported.value.content[0]).toMatchObject({ content: [{ marks: [{ type: 'color', value: '#f00' }, { type: 'background', value: '#000' }, { type: 'subscript' }] }] });
  const exported = exportQuillDelta(imported.value);
  expect(JSON.parse(exported.value).ops[0].attributes).toMatchObject({ color: '#f00', background: '#000', script: 'sub' });
});

it('preserves Quill font and size as namespaced extension marks', () => {
  const imported = importQuillDelta(JSON.stringify({ ops: [{ insert: 'Title', attributes: { font: 'serif', size: 'large' } }, { insert: '\n' }] }));
  expect(imported.value.content[0]).toMatchObject({ content: [{ marks: [{ type: 'extensionMark', name: 'quill:font' }, { type: 'extensionMark', name: 'quill:size' }] }] });
  const exported = exportQuillDelta(imported.value);
  expect(JSON.parse(exported.value).ops[0].attributes).toMatchObject({ font: 'serif', size: 'large' });
});
