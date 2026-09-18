// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isARTDocument } from '../../core/src/index.js';
import { fromHTML, toHTML } from '../../html/src/index.js';
import { fromMarkdown, toMarkdown } from '../src/index.js';

interface Fixture { example: number; markdown: string; html: string }
const fixtures: Fixture[] = JSON.parse(readFileSync('packages/markdown/test/fixtures/commonmark-0.31.2-emphasis.json', 'utf8'));
const unsupported = new Map([[475, 'raw HTML image parsing'], [476, 'raw HTML anchor parsing'], [477, 'raw HTML anchor parsing']]);
// Compare canonical ART semantics: duplicate nested em/strong elements become
// one mark, mark nesting order is canonical, and soft line breaks fold to spaces.
const expectedDocument = (fixture: Fixture) => fromHTML(fixture.html.trimEnd().replaceAll('\n', ' '));

describe('CommonMark emphasis delimiter runs', () => {
  it('accounts for all 132 upstream examples', () => {
    expect(fixtures.map(f => f.example)).toEqual(Array.from({ length: 132 }, (_, i) => 350 + i));
  });
  for (const fixture of fixtures) {
    it(`${unsupported.has(fixture.example) ? 'records known mismatch: ' + unsupported.get(fixture.example) : 'matches upstream ART semantics'} ${fixture.example}`, () => {
      const actual = fromMarkdown(fixture.markdown);
      expect(isARTDocument(actual)).toBe(true);
      if (unsupported.has(fixture.example)) expect(actual).not.toEqual(expectedDocument(fixture));
      else expect(actual).toEqual(expectedDocument(fixture));
    });
  }

  it.each(['snake_case_word', 'word__part__end', 'a * spaced * b', '_ _ _ _ text', 'a**"quoted"**', '*\u00a0text\u00a0*'])('keeps non-delimiters literal: %j', source => {
    expect(fromMarkdown(source).content).toEqual([{ type: 'paragraph', content: [{ type: 'text', text: source }] }]);
  });

  it.each(['**bold *italic* bold**', '*italic **bold** italic*', '***both***', '**a `code` b**', '*[label](/path)*', '**<https://example.com/*literal*>**'])('round-trips supported mixed emphasis: %j', source => {
    const doc = fromMarkdown(source);
    expect(fromMarkdown(toMarkdown(doc))).toEqual(doc);
  });

  it('ignores escaped closing delimiters', () => {
    expect(toHTML(fromMarkdown('*a\\*b*'))).toBe('<p><em>a*b</em></p>');
    expect(toHTML(fromMarkdown('**a\\*\\*b**'))).toBe('<p><strong>a**b</strong></p>');
  });

  it('handles long unmatched delimiter sequences', () => {
    const source = 'a_b_c '.repeat(4000);
    expect(fromMarkdown(source).content).toEqual([{ type: 'paragraph', content: [{ type: 'text', text: source.trimEnd() }] }]);
  });

  it('uses Unicode punctuation and whitespace around runs', () => {
    expect(toHTML(fromMarkdown('«_word_» 😀*word*😀'))).toBe('<p>«<em>word</em>» 😀<em>word</em>😀</p>');
  });
});
