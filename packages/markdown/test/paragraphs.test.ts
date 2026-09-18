import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isARTDocument } from '../../core/src/index.js';
import { toHTML } from '../../html/src/index.js';
import { fromMarkdown, toMarkdown } from '../src/index.js';

interface Fixture { example: number; markdown: string; html: string }
const fixtures: Fixture[] = JSON.parse(readFileSync(new URL('./fixtures/commonmark-0.31.2-paragraphs.json', import.meta.url), 'utf8'));
const expectedHTML = (html: string) => html.trimEnd().replace(/\n<\/code>/g, '</code>').replaceAll('<br />\n', '<br>').replace(/>\n</g, '><').replace(/(<pre>[\s\S]*?<\/pre>)|\n/g, (match, code: string | undefined) => code ?? ' ');
const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });

describe('CommonMark paragraphs, blank lines and textual content', () => {
  it('accounts for all upstream examples in the three sections', () => {
    expect(fixtures.map(f => f.example)).toEqual([...Array.from({ length: 9 }, (_, i) => 219 + i), 650, 651, 652]);
  });
  for (const fixture of fixtures) {
    it(`matches upstream example ${fixture.example}`, () => {
      const doc = fromMarkdown(fixture.markdown);
      expect(isARTDocument(doc)).toBe(true);
      expect(toHTML(doc)).toBe(expectedHTML(fixture.html));
      expect(fromMarkdown(toMarkdown(doc))).toEqual(doc);
    });
  }

  it.each(['\u00a0', '\u2003', '\u202f', '\u3000', '\u2028', '\u2029', '\ufeff', '\f', '\v'])('preserves non-ASCII-trimmable paragraph characters: %j', space => {
    const source = `${space}word${space}`;
    const doc = fromMarkdown(source);
    expect(doc.content).toEqual([paragraph(source)]);
    expect(toMarkdown(doc)).toBe(source);
    expect(fromMarkdown(toMarkdown(doc))).toEqual(doc);
    expect(fromMarkdown(space).content).toEqual([paragraph(space)]);
    expect(fromMarkdown(`first\n${space}\nlast`).content).toEqual([paragraph(`first ${space} last`)]);
  });

  it.each(['\u00a0', '\u2003', '\ufeff', '\f', '\v'])('does not use %j as quote indentation', space => {
    expect(fromMarkdown(`${space}> text`).content).toEqual([paragraph(`${space}> text`)]);
  });

  it.each(['\u2028', '\u2029'])('retains %j as text inside a quoted paragraph', separator => {
    const text = `before${separator}after`;
    const doc = fromMarkdown(`> ${text}`);
    expect(doc.content).toEqual([{ type: 'blockquote', content: [paragraph(text)] }]);
    expect(fromMarkdown(toMarkdown(doc))).toEqual(doc);
  });

  it('ignores only ASCII space/tab blank lines', () => {
    expect(fromMarkdown(' \t\nfirst\n \t \nlast\n\t').content).toEqual([paragraph('first'), paragraph('last')]);
  });

  it('preserves Unicode boundaries around soft and hard breaks', () => {
    const doc = fromMarkdown('  \u00a0first\u00a0  \n\t\u2003last\u202f \t');
    expect(doc.content).toEqual([paragraph('\u00a0first\u00a0\n\u2003last\u202f')]);
    expect(fromMarkdown(toMarkdown(doc))).toEqual(doc);
  });

  it('preserves a Unicode-only paragraph between blocks and inside containers', () => {
    expect(fromMarkdown('# Heading\n\n\u00a0\n\nlast').content.slice(1)).toEqual([paragraph('\u00a0'), paragraph('last')]);
    expect(fromMarkdown('> \u00a0').content).toEqual([{ type: 'blockquote', content: [paragraph('\u00a0')] }]);
    expect(fromMarkdown('- \u00a0').content).toEqual([{ type: 'list', style: 'bullet', content: [{ type: 'listItem', content: [paragraph('\u00a0')] }] }]);
  });
});
