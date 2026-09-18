import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { isARTDocument } from '../src/index.js';

const schema = JSON.parse(readFileSync(new URL('../schema/art-v1.schema.json', import.meta.url), 'utf8'));
const validate = new Ajv2020({ strict: true, allErrors: true }).compile(schema);
const doc = (...content: unknown[]) => ({ type: 'doc', version: 1, content });
const text = { type: 'text', text: 'Hello' };
const paragraph = { type: 'paragraph', content: [text] };
const cell = (extra = {}) => ({ type: 'tableCell', content: [paragraph], ...extra });
const row = (...content: unknown[]) => ({ type: 'tableRow', content });
const table = (...content: unknown[]) => ({ type: 'table', content });

const valid: [string, unknown][] = [
  ['empty document', doc()],
  ['inline extension', doc({ type: 'paragraph', content: [{ type: 'extensionInline', name: 'acme:mention', fallbackText: '@Alice', attrs: { id: 42 } }] })],
  ['paragraph with omitted content', doc({ type: 'paragraph' })],
  ['all marks', doc({ type: 'paragraph', content: [{ ...text, marks: [
    ...['bold', 'italic', 'underline', 'strike', 'code'].map(type => ({ type })),
    { type: 'link', href: '/relative' }, { type: 'extensionMark', name: 'acme:tag', attrs: { nested: [null, true, 3, { name: 'x' }] } },
  ] }] })],
  ...[1, 2, 3, 4, 5, 6].map(level => [`heading ${level}`, doc({ type: 'heading', level, content: [text] })] as [string, unknown]),
  ['nested blocks', doc({ type: 'blockquote', content: [paragraph, { type: 'codeBlock', text: '', language: 'js' }, { type: 'horizontalRule' }] })],
  ...['bullet', 'ordered', 'task'].map(style => [`${style} list`, doc({ type: 'list', style, start: 2, content: [{ type: 'listItem', checked: false, content: [paragraph] }] })] as [string, unknown]),
  ['image with fractional dimensions', doc({ type: 'image', src: 'image.png', alt: '', title: 'Photo', width: 1.5, height: 2 })],
  ['table with combined spans and covered row', doc(table(row(cell({ colspan: 2, rowspan: 2 })), row()))],
  ['extension block', doc({ type: 'extensionBlock', name: 'acme:card', attrs: { data: {} }, content: [paragraph], fallbackText: 'Card' })],
  ['unknown properties remain accepted', { ...doc({ ...paragraph, metadata: 'retained' }), extra: true }],
];
const invalid: [string, unknown][] = [
  ...[{ name: 'bad' }, { fallbackText: '' }, { marks: [] }, { text: 'x' }, { content: [] }, { attrs: [] }].map((extra, i) => [`invalid inline extension ${i}`, doc({ type: 'paragraph', content: [{ type: 'extensionInline', name: 'acme:mention', fallbackText: '@Alice', ...extra }] })] as [string, unknown]),
  ['unknown version', { ...doc(), version: 2 }], ['missing content', { type: 'doc', version: 1 }],
  ['unknown block', doc({ type: 'video' })], ['inline at root', doc(text)],
  ['block in paragraph', doc({ type: 'paragraph', content: [paragraph] })],
  ['null optional content', doc({ type: 'paragraph', content: null })],
  ['heading range', doc({ type: 'heading', level: 7 })], ['heading fraction', doc({ type: 'heading', level: 1.5 })],
  ['missing code text', doc({ type: 'codeBlock' })], ['non-string language', doc({ type: 'codeBlock', text: '', language: 1 })],
  ['missing quote content', doc({ type: 'blockquote' })],
  ['missing task checked', doc({ type: 'list', style: 'task', content: [{ type: 'listItem', content: [] }] })],
  ['invalid list start', doc({ type: 'list', style: 'ordered', start: 0, content: [] })],
  ['invalid list style', doc({ type: 'list', style: 'number', content: [] })],
  ['empty image URL', doc({ type: 'image', src: '' })], ['zero image width', doc({ type: 'image', src: 'x', width: 0 })],
  ['empty table', doc(table())], ['zero span', doc(table(row(cell({ colspan: 0 }))))],
  ['unsafe span', doc(table(row(cell({ colspan: 9007199254740992 }))))],
  ['fractional span', doc(table(row(cell({ rowspan: 1.5 }))))],
  ['invalid row', doc(table({ type: 'tableRow', content: [paragraph] }))],
  ['extension namespace', doc({ type: 'extensionBlock', name: 'card' })],
  ['extension attrs array', doc({ type: 'extensionBlock', name: 'acme:card', attrs: [] })],
  ...[{ type: 'link', href: '' }, { type: 'unknown' }, { type: 'extensionMark', name: 'bad' }].map((mark, i) => [`invalid mark ${i}`, doc({ type: 'paragraph', content: [{ ...text, marks: [mark] }] })] as [string, unknown]),
];

describe('ART v1 JSON Schema parity on JSON data', () => {
  it.each(valid)('accepts %s in schema and runtime', (_name, value) => {
    expect(validate(value), JSON.stringify(validate.errors)).toBe(true);
    expect(isARTDocument(value)).toBe(true);
  });
  it.each(invalid)('rejects %s in schema and runtime', (_name, value) => {
    expect(validate(value)).toBe(false);
    expect(isARTDocument(value)).toBe(false);
  });
  it.each([
    ['unequal widths', doc(table(row(cell(), cell()), row(cell())))],
    ['rowspan past last row', doc(table(row(cell({ rowspan: 2 }))))],
    ['uncovered empty row', doc(table(row()))],
  ])('leaves %s to runtime semantics', (_name, value) => {
    expect(validate(value)).toBe(true);
    expect(isARTDocument(value)).toBe(false);
  });
  it('leaves depth limits to the runtime validator', () => {
    let block: unknown = paragraph;
    for (let i = 0; i < 34; i++) block = { type: 'blockquote', content: [block] };
    expect(validate(doc(block))).toBe(true);
    expect(isARTDocument(doc(block))).toBe(false);
  });
});
