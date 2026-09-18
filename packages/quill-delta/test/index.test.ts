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
  expect(imported.diagnostics).toContainEqual(expect.objectContaining({ code: 'unsupported-embed' }));
  const exported = exportQuillDelta({ type: 'doc', version: 1, content: [{ type: 'image', src: 'https://example.com/a.png' }] });
  expect(JSON.parse(exported.value).ops[0]).toEqual({ insert: { image: 'https://example.com/a.png' } });
});
