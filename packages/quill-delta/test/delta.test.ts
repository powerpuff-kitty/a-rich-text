import { describe, expect, it } from 'vitest';
import { createTextDocument, type ARTDocument } from '@arichtext/core';
import { FormatProfileRegistry } from '@arichtext/core/profiles';
import { exportQuillDelta, importQuillDelta, quillDeltaProfile } from '../src/index.js';
const delta = (...ops: unknown[]) => JSON.stringify({ ops });
const paragraph = (text: string) => ({ type: 'paragraph' as const, content: text ? [{ type: 'text' as const, text }] : [] });
const doc = (content: ARTDocument['content']): ARTDocument => ({ type: 'doc', version: 1, content });

describe('Quill document Delta profile', () => {
  it('maps newline-delimited paragraphs and preserves Unicode and blank lines', () => {
    expect(importQuillDelta(delta({ insert: 'Hello 🐈\n\nLast\n' }))).toEqual({ value: doc([paragraph('Hello 🐈'), paragraph(''), paragraph('Last')]), diagnostics: [] });
  });
  it('normalizes op segmentation without dropping inline marks', () => {
    const value = importQuillDelta(delta({ insert: 'ab', attributes: { bold: true } }, { insert: 'cd', attributes: { bold: true } }, { insert: '\n' }));
    expect(value.value.content).toEqual([{ type: 'paragraph', content: [{ type: 'text', text: 'abcd', marks: [{ type: 'bold' }] }] }]);
  });
  it.each([1, 2, 3, 4, 5, 6])('round-trips heading level %s', level => {
    const input = delta({ insert: 'Heading' }, { insert: '\n', attributes: { header: level } });
    const imported = importQuillDelta(input);
    expect(imported.diagnostics).toEqual([]);
    expect(exportQuillDelta(imported.value)).toEqual({ value: input, diagnostics: [] });
  });
  it('round-trips supported text blocks and all inline marks', () => {
    const value = doc([
      { type: 'paragraph', content: [{ type: 'text', text: 'Styled', marks: [{ type: 'bold' }, { type: 'italic' }, { type: 'underline' }, { type: 'strike' }, { type: 'code' }, { type: 'link', href: '/docs' }] }] },
      { type: 'blockquote', content: [paragraph('Quote'), paragraph('Next')] },
      { type: 'codeBlock', language: 'javascript', text: 'const a = 1;\n\n' },
      { type: 'list', style: 'bullet', content: [{ type: 'listItem', content: [paragraph('Bullet')] }] },
      { type: 'list', style: 'ordered', content: [{ type: 'listItem', content: [paragraph('Number')] }] },
      { type: 'list', style: 'task', content: [{ type: 'listItem', checked: true, content: [paragraph('Done')] }, { type: 'listItem', checked: false, content: [paragraph('Todo')] }] },
    ]);
    const exported = exportQuillDelta(value);
    expect(exported.diagnostics).toEqual([]);
    expect(importQuillDelta(exported.value)).toEqual({ value, diagnostics: [] });
  });
  it.each([
    { ops: [{ retain: 1 }] }, { ops: [{ delete: 1 }] }, { ops: [{ insert: 'x\n', retain: 0 }] },
    { ops: [{ insert: { image: 'photo.png' } }, { insert: '\n' }] },
    { ops: [] }, { ops: [{ insert: '' }] }, { ops: [{ insert: 'no final newline' }] },
    { ops: [{ insert: 'x\n', attributes: [] }] }, { ops: [{ insert: 'x\n', attributes: { bold: 'yes' } }] },
    { ops: [{ insert: 'x\n', attributes: { header: 7 } }] }, { ops: [{ insert: 'x\n', attributes: { list: 'unknown' } }] },
    { ops: [{ insert: 'x\n', attributes: { header: 1, list: 'bullet' } }] },
    { ops: [{ insert: 'x\n', attributes: { link: 42 } }] }, { ops: [{ insert: 'x\n', attributes: { blockquote: 'yes' } }] },
    { ops: [{ insert: 'x\n', attributes: { 'code-block': {} } }] }, null,
  ])('rejects malformed or unsupported snapshot %j', value => {
    expect(() => importQuillDelta(JSON.stringify(value))).toThrow();
  });
  it('reports unknown and misplaced attributes before replacing rich text', () => {
    const imported = importQuillDelta(delta({ insert: 'Text', attributes: { header: 2, color: 'red' } }, { insert: '\n', attributes: { list: 'bullet', indent: 1 } }));
    expect(imported.diagnostics?.map(note => note.code)).toEqual(['unsupported-attributes', 'misplaced-line-format']);
    expect(imported.diagnostics?.every(note => note.severity === 'loss')).toBe(true);
  });
  it('reports marks lost inside code blocks and metadata omissions', () => {
    expect(importQuillDelta(JSON.stringify({ metadata: {}, ops: [{ insert: 'x\n', attributes: { bold: true, 'code-block': true }, extra: 1 }] })).diagnostics?.map(note => note.code)).toEqual(['extra-fields', 'code-marks']);
  });
  it.each([
    { type: 'image', src: '/photo.png', alt: 'Photo' }, { type: 'horizontalRule' },
    { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [paragraph('Cell')] }] }] },
    { type: 'extensionBlock', name: 'acme:card', fallbackText: 'Card' },
    { type: 'list', style: 'bullet', content: [{ type: 'listItem', content: [paragraph('One'), paragraph('Two')] }] },
  ])('reports a plain-text fallback for unsupported ART %j', block => {
    const exported = exportQuillDelta(doc([block as ARTDocument['content'][number]]));
    expect(exported.diagnostics).toContainEqual(expect.objectContaining({ code: 'unsupported-structure', severity: 'loss' }));
    expect(() => importQuillDelta(exported.value)).not.toThrow();
  });
  it('reports numbered starts, duplicate marks, inline newlines and extension marks', () => {
    const value = doc([{ type: 'list', style: 'ordered', start: 4, content: [{ type: 'listItem', checked: false, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A\nB', marks: [{ type: 'bold' }, { type: 'bold' }, { type: 'extensionMark', name: 'acme:tag' }] }] }] }] }]);
    expect(exportQuillDelta(value).diagnostics?.map(note => note.code)).toEqual(expect.arrayContaining(['list-start', 'non-task-checked', 'duplicate-marks', 'extension-marks', 'inline-newlines']));
  });
  it('reports adjacent-group merging and empty-document normalization', () => {
    const quote = { type: 'blockquote' as const, content: [paragraph('Quote')] };
    expect(exportQuillDelta(doc([quote, quote])).diagnostics).toContainEqual(expect.objectContaining({ code: 'adjacent-groups' }));
    expect(exportQuillDelta(doc([])).diagnostics).toContainEqual(expect.objectContaining({ code: 'empty-document' }));
  });
  it('integrates with registry errors, preview isolation and loss diagnostics', () => {
    const registry = new FormatProfileRegistry(); registry.register(quillDeltaProfile);
    const original = createTextDocument('Original'); const before = JSON.stringify(original);
    expect(registry.export('quill:delta-v2', original).ok).toBe(true);
    expect(JSON.stringify(original)).toBe(before);
    expect(registry.import('quill:delta-v2', delta({ retain: 1 }))).toMatchObject({ ok: false });
    expect(registry.import('quill:delta-v2', delta({ insert: 'Text\n', attributes: { color: 'red' } }))).toMatchObject({ ok: true, diagnostics: [{ severity: 'loss' }] });
  });
});
