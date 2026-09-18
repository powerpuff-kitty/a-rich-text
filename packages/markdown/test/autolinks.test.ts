import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isARTDocument } from '../../core/src/index.js';
import { toHTML } from '../../html/src/index.js';
import { fromMarkdown, toMarkdown } from '../src/index.js';

interface Fixture { example: number; markdown: string; html: string }
const fixtures: Fixture[] = JSON.parse(readFileSync(new URL('./fixtures/commonmark-0.31.2-autolinks.json', import.meta.url), 'utf8'));
// These schemes intentionally remain outside ART's existing URL allowlist.
const blockedSchemes = new Set([596, 598, 599, 601]);

describe('CommonMark angle-bracket autolinks', () => {
  it('accounts for every upstream example', () => {
    expect(fixtures.map(f => f.example)).toEqual(Array.from({ length: 19 }, (_, i) => 594 + i));
  });
  for (const fixture of fixtures) {
    it(`${blockedSchemes.has(fixture.example) ? 'retains the URL policy exception' : 'matches upstream example'} ${fixture.example}`, () => {
      const doc = fromMarkdown(fixture.markdown);
      expect(isARTDocument(doc)).toBe(true);
      if (blockedSchemes.has(fixture.example)) {
        expect(doc.content).toEqual([{ type: 'paragraph', content: [{ type: 'text', text: fixture.markdown.trimEnd() }] }]);
        expect(toHTML(doc)).not.toBe(fixture.html.trimEnd());
      } else {
        expect(toHTML(doc)).toBe(fixture.html.trimEnd());
      }
    });
  }

  it.each([
    '<https://example.com/a_(b)?q=*raw*&x=%20>',
    '<https://example.com/a](b)>',
    '<https://example.com/\\[\\>',
    '<https://example.com/`literal`>',
    '<https://example.com/é?q=%22&x=1>',
    '<person+tag@example.com>',
    '<person`tag@example.com>',
    '<https://example.com?q=&amp;>',
    '**<https://example.com/*raw*>**',
    '<u><person@example.com></u>',
    'prefix <https://example.com> suffix',
  ])('round-trips autolink text, targets and enclosing marks: %j', source => {
    const doc = fromMarkdown(source);
    expect(isARTDocument(doc)).toBe(true);
    expect(toHTML(doc)).toContain('<a ');
    expect(fromMarkdown(toMarkdown(doc))).toEqual(doc);
  });

  it('gives an autolink precedence over code and emphasis inside its label', () => {
    expect(fromMarkdown('<https://example.com/`code`/*bold*/_word_>').content).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'https://example.com/`code`/*bold*/_word_', marks: [{ type: 'link', href: 'https://example.com/%60code%60/*bold*/_word_' }] }] },
    ]);
  });

  it('retains literal entity-like URL text and existing percent escapes', () => {
    const label = 'https://example.com/?q=&amp;&x=%20&y=%invalid';
    expect(fromMarkdown(`<${label}>`).content).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: label, marks: [{ type: 'link', href: 'https://example.com/?q=&amp;&x=%20&y=%25invalid' }] }] },
    ]);
  });

  it('keeps angle-bracket text inside code literal', () => {
    expect(toHTML(fromMarkdown('`<https://example.com>`'))).toBe('<p><code>&lt;https://example.com&gt;</code></p>');
  });

  it.each(['<javascript:alert(1)>', '<JaVaScRiPt:alert(1)>', '<data:text/html,test>', '<file:///tmp/test>', '<vbscript:test>'])('retains blocked URLs as literal text: %j', source => {
    const doc = fromMarkdown(source);
    expect(doc.content).toEqual([{ type: 'paragraph', content: [{ type: 'text', text: source }] }]);
    expect(fromMarkdown(toMarkdown(doc))).toEqual(doc);
  });

  it.each(['<https://example.com', '\\<https://example.com>', '<https://example.com/a\nb>', '<https://example.com/a\tb>', '<https://example.com/\u007f>', '<person@-example.com>', '<person@example-.com>'])('does not turn incomplete, escaped or invalid input into a link: %j', source => {
    expect(toHTML(fromMarkdown(source))).not.toContain('<a ');
  });

  it('does not wrap an autolink in a second link', () => {
    const doc = fromMarkdown('[<https://example.com>](https://outer.example)');
    expect(toHTML(doc)).toBe('<p>[<a href="https://example.com">https://example.com</a>](https://outer.example)</p>');
    expect(isARTDocument(doc)).toBe(true);
  });

  it('restores literal syntax in explicit angle-bracket link destinations', () => {
    const doc = fromMarkdown('[label](<https://example.com/path>)');
    expect(toHTML(doc)).toBe('<p><a href="https://example.com/path">label</a></p>');
    expect(fromMarkdown(toMarkdown(doc))).toEqual(doc);
  });

  it('does not leak placeholder-like user text or throw on malformed Unicode', () => {
    const doc = fromMarkdown('\uE0000\uE000 <https://example.com/\ud800>');
    expect(isARTDocument(doc)).toBe(true);
    expect(doc.content).toEqual([{ type: 'paragraph', content: [{ type: 'text', text: '\uE0000\uE000 <https://example.com/\ud800>' }] }]);
  });
});
