// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isARTDocument } from '../../core/src/index.js';
import type { ARTDocument } from '../../core/src/index.js';
import { fromHTML } from '../../html/src/index.js';
import { fromMarkdown, toMarkdown } from '../src/index.js';

interface Fixture { example: number; markdown: string; html: string }
const fixtures: Fixture[] = JSON.parse(readFileSync('packages/markdown/test/fixtures/gfm-0.29-tables.json', 'utf8'));
// ART has no header-cell or column-alignment field. Compare retained cell and
// block semantics after HTML import, folding the non-table paragraph soft break.
const expectedDocument = (fixture: Fixture) => fromHTML(fixture.html.replace(/>\n</g, '><').replaceAll('\n', ' ').trimEnd());
const table = (text: string, marks: { type: 'code' }[] = []): ARTDocument => ({ type: 'doc', version: 1, content: [{ type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text, ...(marks.length ? { marks } : {}) }] }] }] }] }] });

describe('GFM pipe table cell semantics', () => {
  it('accounts for all eight upstream examples', () => {
    expect(fixtures.map(f => f.example)).toEqual(Array.from({ length: 8 }, (_, i) => 198 + i));
  });
  for (const fixture of fixtures) {
    it(`matches retained ART semantics for GFM example ${fixture.example}`, () => {
      const doc = fromMarkdown(fixture.markdown);
      expect(isARTDocument(doc)).toBe(true);
      expect(doc).toEqual(expectedDocument(fixture));
      expect(fromMarkdown(toMarkdown(doc))).toEqual(doc);
    });
  }

  it.each(['|', 'a|b', '\\|', 'end\\', '\u00a0text\u202f', 'before\u2028after'])('round-trips a text cell containing %j', text => {
    const doc = table(text);
    expect(fromMarkdown(toMarkdown(doc))).toEqual(doc);
  });
  it.each(['|', 'a|b', '\\|', 'end\\', '`|`', '\\'.repeat(2) + '|', '\\'.repeat(3) + '|'])('round-trips a code cell containing %j', text => {
    const doc = table(text, [{ type: 'code' }]);
    expect(fromMarkdown(toMarkdown(doc))).toEqual(doc);
  });
  it('preserves an escaped pipe at the end of a row', () => {
    expect(fromMarkdown('| head |\n| --- |\nvalue\\|').content).toMatchObject([{ type: 'table', content: [{}, { content: [{ content: [{ content: [{ text: 'value|' }] }] }] }] }]);
  });
  it.each(['# heading | text', '> quote | text', '- list | text', '```js | text'])('ends a table before a block marker containing a pipe: %j', line => {
    const doc = fromMarkdown('| head |\n| --- |\n' + line);
    expect(doc.content).toHaveLength(2);
    expect(doc.content[0]).toMatchObject({ type: 'table', content: [{}] });
  });
  it('does not treat Unicode whitespace as delimiter-row padding', () => {
    expect(fromMarkdown('| head |\n| \u00a0--- |').content[0]?.type).toBe('paragraph');
  });
  it('keeps pipe-delimited separator-like body rows in the current table', () => {
    const doc = fromMarkdown('| head |\n| --- |\n| value |\n| --- |');
    expect(doc.content).toHaveLength(1);
    expect(doc.content[0]).toMatchObject({ type: 'table', content: [{}, {}, { content: [{ content: [{ content: [{ text: '---' }] }] }] }] });
  });

  it('bounds automatic cell padding and preserves remaining input', () => {
    const header = '| ' + Array(128).fill('h').join(' | ') + ' |';
    const separator = '| ' + Array(128).fill('-').join(' | ') + ' |';
    const doc = fromMarkdown([header, separator, ...Array(520).fill('value')].join('\n'));
    const first = doc.content[0]!;
    expect(first.type).toBe('table');
    if (first.type !== 'table') throw new Error('Expected table');
    const consumed = first.content.length - 1;
    expect(consumed * 127).toBeLessThanOrEqual(65_536);
    expect((consumed + 1) * 127).toBeGreaterThan(65_536);
    expect(doc.content[1]).toEqual({ type: 'paragraph', content: [{ type: 'text', text: Array(520 - consumed).fill('value').join(' ') }] });
  });

  it('does not turn an escaped header pipe into table syntax', () => {
    expect(fromMarkdown('a\\|b\n---').content[0]?.type).toBe('heading');
  });
});
