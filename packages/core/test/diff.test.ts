import { expect, it } from 'vitest';
import { createTextDocument, type ARTDocument } from '../src/index.js';
import { diffDocuments } from '../src/diff.js';

it('compares equal documents independent of object property order', () => {
  const a = createTextDocument('Same');
  expect(diffDocuments(a, JSON.parse(JSON.stringify(a)))).toEqual([]);
  expect(diffDocuments(a, { content: a.content, version: 1, type: 'doc' })).toEqual([]);
});
it('reports text, marks and inserted blocks with unambiguous paths', () => {
  const a = createTextDocument('Before');
  const b: ARTDocument = { type: 'doc', version: 1, content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'After', marks: [{ type: 'bold' }] }] },
    { type: 'horizontalRule' },
  ] };
  expect(diffDocuments(a, b)).toEqual([
    { kind: 'add', path: ['content', 0, 'content', 0, 'marks'], after: [{ type: 'bold' }] },
    { kind: 'replace', path: ['content', 0, 'content', 0, 'text'], before: 'Before', after: 'After' },
    { kind: 'add', path: ['content', 1], after: { type: 'horizontalRule' } },
  ]);
  expect(diffDocuments(b, a)).toContainEqual({ kind: 'remove', path: ['content', 1], before: { type: 'horizontalRule' } });
});
it('detaches values in changes and rejects unsupported document versions', () => {
  const a = createTextDocument('A');
  const b: ARTDocument = { ...a, content: [...a.content, { type: 'horizontalRule' }] };
  const change = diffDocuments(a, b).at(-1)!;
  if (change.kind === 'add') (change.after as { type: string }).type = 'changed';
  expect(b.content[1]).toEqual({ type: 'horizontalRule' });
  expect(() => diffDocuments({ ...a, version: 2 } as unknown as ARTDocument, b)).toThrow('Invalid ART document');
});
