import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fromMarkdown, toMarkdown } from '../src/index.js';
import { toHTML } from '../../html/src/index.js';

interface Fixture { example: number; markdown: string; html: string }
const fixtures: Fixture[] = JSON.parse(readFileSync(new URL('./fixtures/commonmark-0.31.2-setext-headings.json', import.meta.url), 'utf8'));
// Normalize block separators, soft breaks outside code, equivalent text quotes,
// and ART's omitted final code line terminator. Preserve internal code spacing.
const expectedHTML = (html: string) => html.trimEnd().replace(/\n<\/code>/g, '</code>').replace(/>\n</g, '><').replaceAll('<hr />', '<hr>').replace(/(<pre>[\s\S]*?<\/pre>)|\n/g, (match, code: string | undefined) => code ?? ' ').replaceAll('&quot;', '"');
const unsupported = new Map([[93, 'lazy blockquote continuation'], [94, 'tight-list paragraph rendering'], [99, 'tight-list paragraph rendering']]);

describe('CommonMark setext headings', () => {
  it('accounts for every upstream example', () => {
    expect(fixtures.map(f => f.example)).toEqual(Array.from({ length: 27 }, (_, i) => 80 + i));
  });
  for (const fixture of fixtures) {
    it(`${unsupported.has(fixture.example) ? 'records known mismatch: ' + unsupported.get(fixture.example) : 'matches upstream example'} ${fixture.example}`, () => {
      const actual = toHTML(fromMarkdown(fixture.markdown)).replaceAll('&quot;', '"');
      if (unsupported.has(fixture.example)) expect(actual).not.toBe(expectedHTML(fixture.html));
      else expect(actual).toBe(expectedHTML(fixture.html));
    });
  }
  it.each(['Title\n=', 'Title\n-', 'Multi\nline *heading*\n===', '> Heading\n> ---', '- Heading\n  ===', 'Title\n===\n\n| A | B |\n| --- | --- |\n| x | y |'])('round-trips canonical headings for %j', source => {
    const doc = fromMarkdown(source);
    expect(fromMarkdown(toMarkdown(doc))).toEqual(doc);
  });
  it('does not treat an indented tab or escaped underline as a heading', () => {
    for (const marker of ['\t===', '   \t---', '\\===', '\\---', '= =']) {
      expect(fromMarkdown(`Title\n${marker}`).content[0]?.type).toBe('paragraph');
    }
  });
});
