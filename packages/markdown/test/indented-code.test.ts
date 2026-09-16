import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fromMarkdown, toMarkdown } from '../src/index.js';
import { toHTML } from '../../html/src/index.js';

interface Fixture { example: number; markdown: string; html: string }
const fixtures: Fixture[] = JSON.parse(readFileSync(new URL('./fixtures/commonmark-0.31.2-indented-code.json', import.meta.url), 'utf8'));
// ART code text omits the final line terminator, as with its fenced-code import.
// Normalize HTML block separators and paragraph soft breaks, never code spaces.
const expectedHTML = (html: string) => html.trimEnd().replace(/\n<\/code>/g, '</code>').replace(/>\n</g, '><').replaceAll('Foo\nbar', 'Foo bar').replaceAll('<hr />', '<hr>');

const unsupported = new Map([[109, 'tight-list paragraph rendering'], [115, 'setext headings']]);

describe('CommonMark indented code blocks', () => {
  it('accounts for every upstream example', () => {
    expect(fixtures.map(f => f.example)).toEqual(Array.from({ length: 12 }, (_, i) => 107 + i));
  });
  for (const fixture of fixtures) {
    it(`${unsupported.has(fixture.example) ? 'records known mismatch: ' + unsupported.get(fixture.example) : 'matches upstream example'} ${fixture.example}`, () => {
      const actual = toHTML(fromMarkdown(fixture.markdown));
      if (unsupported.has(fixture.example)) expect(actual).not.toBe(expectedHTML(fixture.html));
      else expect(actual).toBe(expectedHTML(fixture.html));
    });
  }
  it.each(['\tcode', ' \tcode', '  \tcode', '   \tcode', '    code'])('uses four-column indentation for %j', source => {
    expect(fromMarkdown(source).content).toEqual([{ type: 'codeBlock', text: 'code' }]);
  });
  it('preserves tabs and spaces after the first four columns', () => {
    expect(fromMarkdown('\t\tcode\t  ').content).toEqual([{ type: 'codeBlock', text: '\tcode\t  ' }]);
  });
  it('does not interrupt paragraphs with indented block-like text', () => {
    for (const text of ['# heading', '---', '- item', '```', '> quote', '![x](/image)']) {
      expect(fromMarkdown(`paragraph\n    ${text}`).content[0]?.type).toBe('paragraph');
      expect(fromMarkdown(`paragraph\n    ${text}`).content).toHaveLength(1);
    }
  });
  it('preserves code whitespace through fenced export and reimport', () => {
    const doc = fromMarkdown('    <script>\n      x  \n      \n    last');
    expect(fromMarkdown(toMarkdown(doc))).toEqual(doc);
    expect(toHTML(doc)).toContain('&lt;script&gt;');
  });
});
