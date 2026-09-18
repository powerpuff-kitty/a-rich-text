import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fromMarkdown, toMarkdown } from '../src/index.js';
import { toHTML } from '../../html/src/index.js';

interface Fixture { example: number; markdown: string; html: string }
const read = (name: string): Fixture[] => JSON.parse(readFileSync(new URL(`./fixtures/commonmark-0.31.2-${name}.json`, import.meta.url), 'utf8'));
const escapes = read('backslash-escapes');
const breaks = read('line-breaks');
const unsupported = new Map([[21, 'raw HTML'], [22, 'link titles'], [23, 'reference links'], [642, 'raw HTML'], [643, 'raw HTML']]);
const expectedHTML = (html: string) => html.trimEnd().replace(/\n<\/code>/g, '</code>').replaceAll('<br />\n', '<br>').replace(/>\n</g, '><').replace(/(<pre>[\s\S]*?<\/pre>)|\n/g, (match, code: string | undefined) => code ?? ' ').replaceAll('&quot;', '"');

describe('CommonMark escapes and line breaks', () => {
  it('accounts for every upstream example', () => {
    expect(escapes.map(f => f.example)).toEqual(Array.from({ length: 13 }, (_, i) => 12 + i));
    expect(breaks.map(f => f.example)).toEqual(Array.from({ length: 17 }, (_, i) => 633 + i));
  });
  for (const fixture of [...escapes, ...breaks]) {
    it(`${unsupported.has(fixture.example) ? 'records known mismatch: ' + unsupported.get(fixture.example) : 'matches upstream example'} ${fixture.example}`, () => {
      const actual = toHTML(fromMarkdown(fixture.markdown));
      if (unsupported.has(fixture.example)) expect(actual).not.toBe(expectedHTML(fixture.html));
      else expect(actual).toBe(expectedHTML(fixture.html));
    });
  }
  it.each(['first  \nsecond', 'first\\\nsecond', '*first\\\nsecond*', 'first\\\\\nsecond', 'first\\\\\\\nsecond', '```foo\\\\+bar\ntext\n```'])('round-trips canonical text and breaks for %j', source => {
    const doc = fromMarkdown(source);
    expect(fromMarkdown(toMarkdown(doc))).toEqual(doc);
  });
  it('preserves a literal backslash before non-punctuation characters', () => {
    expect(fromMarkdown(String.raw`C:\Users\name \3 \φ`).content).toEqual([{ type: 'paragraph', content: [{ type: 'text', text: String.raw`C:\Users\name \3 \φ` }] }]);
  });
  it('distinguishes escaped backslashes from hard breaks', () => {
    expect(toHTML(fromMarkdown('a\\\\\nb'))).toBe('<p>a\\ b</p>');
    expect(toHTML(fromMarkdown('a\\\\\\\nb'))).toBe('<p>a\\<br>b</p>');
  });
});
