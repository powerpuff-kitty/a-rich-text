// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isARTDocument } from '../../core/src/index.js';
import type { ARTBlockNode, ARTDocument } from '../../core/src/index.js';
import { fromHTML, toHTML } from '../../html/src/index.js';
import { fromMarkdown, toMarkdown } from '../src/index.js';

interface Fixture { example: number; markdown: string; html: string }
const fixtures: Fixture[] = JSON.parse(readFileSync('packages/markdown/test/fixtures/commonmark-0.31.2-blockquotes.json', 'utf8'));
const unsupported = new Map([[235, 'tight-list paragraph wrappers']]);
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

  it.each(['> *first\nsecond*', '> `first\nsecond`', '>>> first\n> second\n>> third', '> first\n    - continuation', '> first\nsecond\n==='])('round-trips lazy paragraph continuation: %j', source => {
    const doc = fromMarkdown(source);
    expect(doc.content).toHaveLength(1);
    expect(doc.content[0]?.type).toBe('blockquote');
    expect(fromMarkdown(toMarkdown(doc))).toEqual(doc);
  });
  it.each(['> # heading\noutside', '>     code\noutside', '> ```\noutside', '> first\n>\noutside', '> first\n\noutside', '> first\n> ===\noutside'])('does not extend a closed paragraph: %j', source => {
    const doc = fromMarkdown(source);
    expect(doc.content).toHaveLength(2);
    expect(doc.content[0]?.type).toBe('blockquote');
    expect(doc.content[1]).toEqual({ type: 'paragraph', content: [{ type: 'text', text: 'outside' }] });
  });
  it('closes only the quote levels missing from a new block', () => {
    expect(toHTML(fromMarkdown('>>> first\n> # heading\n> next\noutside'))).toBe('<blockquote><blockquote><blockquote><p>first</p></blockquote></blockquote><h1>heading</h1><p>next outside</p></blockquote>');
  });
  it('parses inline markup across omitted markers once for the whole paragraph', () => {
    expect(toHTML(fromMarkdown('> *first\nsecond* and `code\ncontinued`'))).toBe('<blockquote><p><em>first second</em> and <code>code continued</code></p></blockquote>');
  });
  it('handles long paragraphs with alternating explicit and omitted markers', () => {
    const source = Array.from({ length: 2000 }, (_, i) => (i % 2 ? '' : '> ') + 'word').join('\n');
    expect(fromMarkdown(source).content).toEqual([{ type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: Array(2000).fill('word').join(' ') }] }] }]);
  });


  it.each(['> - item\n>\noutside\n> later', '> | head |\n> | --- |\noutside\n> later'])('keeps list/table collectors inside their explicit quote boundary: %j', source => {
    const doc = fromMarkdown(source);
    expect(doc.content).toHaveLength(3);
    expect(doc.content[0]?.type).toBe('blockquote');
    expect(doc.content[1]).toEqual({ type: 'paragraph', content: [{ type: 'text', text: 'outside' }] });
    expect(doc.content[2]).toEqual({ type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'later' }] }] });
  });

});
