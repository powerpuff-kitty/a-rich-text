import { it, expect } from 'vitest';
import { exportQuillDelta } from '../src/index.js';

it('reports inline extension fallback loss explicitly', () => {
  const result = exportQuillDelta({ type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'extensionInline', name: 'acme:mention', fallbackText: '@Alice', attrs: { id: 42 } }] }] });
  expect(JSON.parse(result.value).ops).toEqual([{ insert: '@Alice\n' }]);
  expect(result.diagnostics).toContainEqual({ code: 'extension-inline', severity: 'loss', message: 'Inline extensions become fallback text' });
});
