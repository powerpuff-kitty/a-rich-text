import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { toHTML } from '../../html/src/index.js';
import { fromMarkdown, toMarkdown } from '../src/index.js';
import type { ARTDocument } from '../../core/src/index.js';

interface Fixture { example: number; markdown: string; html: string }
const fixtures: Fixture[] = JSON.parse(readFileSync(new URL('./fixtures/commonmark-0.31.2-atx-headings.json', import.meta.url), 'utf8'));
// ART omits block-separating newlines, folds paragraph soft breaks to spaces,
// uses the equivalent HTML void-element spelling <hr>, and omits the code
// block final line terminator (the same convention as fenced-code import).
const expectedHTML = (html: string) => html.trimEnd().replace(/>\n</g, '><').replaceAll('<hr />', '<hr>').replaceAll('foo\n# bar', 'foo # bar').replace(/\n<\/code>/g, '</code>');

describe('CommonMark 0.31.2 ATX headings', () => {
  it('accounts for every upstream heading example', () => {
    expect(fixtures.map(f => f.example)).toEqual(Array.from({ length: 18 }, (_, i) => 62 + i));
  });
  for (const fixture of fixtures) {
    it(`matches upstream example ${fixture.example}`, () => {
      const actual = toHTML(fromMarkdown(fixture.markdown));
      expect(actual).toBe(expectedHTML(fixture.html));
    });
  }
  it.each(['foo#', 'foo ###', '#', '###', 'foo \\###', 'foo\t###', ''])('round-trips heading text %j', text => {
    const doc: ARTDocument = { type: 'doc', version: 1, content: [{ type: 'heading', level: 2, content: text ? [{ type: 'text', text }] : [] }] };
    expect(fromMarkdown(toMarkdown(doc))).toEqual(doc);
  });
  it('accepts tab separators but not Unicode spaces as heading delimiters', () => {
    expect(fromMarkdown('#\ttext\t###').content).toEqual([{ type: 'heading', level: 1, content: [{ type: 'text', text: 'text' }] }]);
    expect(fromMarkdown('#\u00a0text').content[0]?.type).toBe('paragraph');
    expect(fromMarkdown('\u00a0# text').content[0]?.type).toBe('paragraph');
  });
  it('empty headings interrupt paragraphs and preserve subsequent blocks', () => {
    expect(fromMarkdown('before\n#\nafter').content.map(block => block.type)).toEqual(['paragraph', 'heading', 'paragraph']);
  });
});
