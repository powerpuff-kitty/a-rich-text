// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isARTDocument } from '../../core/src/index.js';
import type { ARTBlockNode, ARTDocument } from '../../core/src/index.js';
import { fromHTML, toHTML } from '../../html/src/index.js';
import { fromMarkdown, toMarkdown } from '../src/index.js';

interface Fixture { example: number; markdown: string; html: string }
const fixtures: Fixture[] = JSON.parse(readFileSync('packages/markdown/test/fixtures/commonmark-0.31.2-blockquotes.json', 'utf8'));
const unsupported = new Map([
  [232, 'lazy continuation'], [233, 'lazy continuation'], [235, 'tight-list paragraph wrappers'],
  [238, 'lazy continuation'], [247, 'lazy continuation'], [250, 'nested lazy continuation'], [251, 'nested lazy continuation'],
]);
const expectedHTML = (html: string) => html.trimEnd().replace(/\n<\/code>/g, '</code>').replaceAll('<hr />', '<hr>').replace(/>\n</g, '><').replace(/(<pre>[\s\S]*?<\/pre>)|\n/g, (match, code: string | undefined) => code ?? ' ');
const emptyQuote: ARTBlockNode = { type: 'blockquote', content: [] };

describe('CommonMark blockquote structure', () => {
  it('accounts for all 25 upstream blockquote examples', () => {
    expect(fixtures.map(f => f.example)).toEqual(Array.from({ length: 25 }, (_, i) => 228 + i));
  });
  for (const fixture of fixtures) {
    it(`${unsupported.has(fixture.example) ? 'records known mismatch: ' + unsupported.get(fixture.example) : 'matches upstream example'} ${fixture.example}`, () => {
      const doc = fromMarkdown(fixture.markdown);
      expect(isARTDocument(doc)).toBe(true);
      if (unsupported.has(fixture.example)) expect(toHTML(doc)).not.toBe(expectedHTML(fixture.html));
      else expect(toHTML(doc)).toBe(expectedHTML(fixture.html));
    });
  }
  it.each(['>', '> ', '>\n>  \n> ', '   >'])('retains an empty quote from %j', source => {
    expect(fromMarkdown(source).content).toEqual([emptyQuote]);
  });
  it.each<ARTBlockNode[]>([
    [emptyQuote],
    [emptyQuote, emptyQuote],
    [{ type: 'list', style: 'bullet', content: [{ type: 'listItem', content: [emptyQuote] }] }],
    [{ type: 'blockquote', content: [emptyQuote] }],
    [emptyQuote, { type: 'paragraph', content: [{ type: 'text', text: 'after' }] }],
    [{ type: 'paragraph', content: [{ type: 'text', text: 'before' }] }, emptyQuote],
    [{ type: 'blockquote', content: [emptyQuote, { type: 'paragraph', content: [{ type: 'text', text: 'inside' }] }, emptyQuote] }],
  ])('round-trips empty quote structure through Markdown and HTML: %j', (...content) => {
    const doc: ARTDocument = { type: 'doc', version: 1, content };
    expect(isARTDocument(doc)).toBe(true);
    expect(fromMarkdown(toMarkdown(doc))).toEqual(doc);
    expect(fromHTML(toHTML(doc))).toEqual(doc);
    expect(fromMarkdown(toMarkdown(fromHTML(toHTML(doc))))).toEqual(doc);
  });
});
