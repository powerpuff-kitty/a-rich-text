import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { toHTML } from '../../html/src/index.js';
import { fromMarkdown, toMarkdown } from '../src/index.js';
import { createTextDocument } from '../../core/src/index.js';

interface Fixture { example: number; markdown: string; html: string; section: string }
const fixtures: Fixture[] = JSON.parse(readFileSync(new URL('./fixtures/commonmark-0.31.2-code-spans.json', import.meta.url), 'utf8'));
const unsupported = new Map([
  [344, 'Raw HTML precedence is outside the supported Markdown subset'],
]);
// ART folds soft breaks to spaces and emits literal quotes in HTML text.
// These normalizations do not alter code contents or element structure.
const expectedHTML = (html: string) => html.trimEnd().replace(/<\/code>\n<code>/g, '</code> <code>').replaceAll('&quot;', '"');

describe('CommonMark 0.31.2 code spans (scoped compatibility)', () => {
  it('accounts for all upstream section examples with explicit exclusions', () => {
    expect(fixtures.map(fixture => fixture.example)).toEqual(Array.from({ length: 22 }, (_, index) => 328 + index));
    expect(fixtures.filter(fixture => !unsupported.has(fixture.example))).toHaveLength(21);
  });
  for (const fixture of fixtures) {
    const reason = unsupported.get(fixture.example);
    if (reason) {
      it(`records known mismatch ${fixture.example}: ${reason}`, () => {
        expect(toHTML(fromMarkdown(fixture.markdown))).not.toBe(expectedHTML(fixture.html));
      });
    } else {
      it(`matches upstream example ${fixture.example}`, () => {
        expect(toHTML(fromMarkdown(fixture.markdown))).toBe(expectedHTML(fixture.html));
      });
    }
  }
  it.each(['foo', ' foo ', '  foo  ', ' ', '  ', '`', '``', '`foo`', 'a `` b', '\\', '\uE0000\uE000'])('round-trips inline code text %j', text => {
    const document = createTextDocument(text);
    const paragraph = document.content[0];
    if (paragraph.type === 'paragraph') paragraph.content![0].marks = [{ type: 'code' }];
    expect(fromMarkdown(toMarkdown(document))).toEqual(document);
  });
  it('preserves marks enclosing code and literal placeholder-like text', () => {
    expect(fromMarkdown('**a `b` c** \uE0000\uE000')).toEqual({ type: 'doc', version: 1, content: [{ type: 'paragraph', content: [
      { type: 'text', text: 'a ', marks: [{ type: 'bold' }] },
      { type: 'text', text: 'b', marks: [{ type: 'bold' }, { type: 'code' }] },
      { type: 'text', text: ' c', marks: [{ type: 'bold' }] },
      { type: 'text', text: ' \uE0000\uE000' },
    ] }] });
  });
  it('never leaks protected code tokens into link destinations', () => {
    const document = fromMarkdown('[link](/path/`literal`/$&)');
    expect(document.content).toEqual([{ type: 'paragraph', content: [{ type: 'text', text: 'link', marks: [{ type: 'link', href: '/path/`literal`/$&' }] }] }]);
    expect(fromMarkdown(toMarkdown(document))).toEqual(document);
  });

});
