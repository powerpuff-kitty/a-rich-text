import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fromMarkdown, toMarkdown } from '../src/index.js';
import { toHTML } from '../../html/src/index.js';

interface Fixture { example: number; markdown: string; html: string }
const fixtures: Fixture[] = JSON.parse(readFileSync(new URL('./fixtures/commonmark-0.31.2-thematic-breaks.json', import.meta.url), 'utf8'));
// Normalize block separators, soft breaks outside code and ART's final code-line
// convention. Keep list paragraph wrappers and inline formatting significant.
const expectedHTML = (html: string) => html.trimEnd().replace(/\n<\/code>/g, '</code>').replace(/>\n</g, '><').replaceAll('<hr />', '<hr>').replace(/(<pre>[\s\S]*?<\/pre>)|\n/g, (match, code: string | undefined) => code ?? ' ');
const unsupported = new Map([
  [57, 'tight-list paragraph rendering'],
  [60, 'tight-list paragraph rendering'],
  [61, 'tight-list paragraph rendering'],
]);

describe('CommonMark thematic breaks', () => {
  it('accounts for every upstream example', () => {
    expect(fixtures.map(f => f.example)).toEqual(Array.from({ length: 19 }, (_, i) => 43 + i));
  });
  for (const fixture of fixtures) {
    it(`${unsupported.has(fixture.example) ? 'records known mismatch: ' + unsupported.get(fixture.example) : 'matches upstream example'} ${fixture.example}`, () => {
      const actual = toHTML(fromMarkdown(fixture.markdown));
      if (unsupported.has(fixture.example)) expect(actual).not.toBe(expectedHTML(fixture.html));
      else expect(actual).toBe(expectedHTML(fixture.html));
    });
  }

  it.each(['*\t*\t*', '-\t -\t-', '_ \t_\t _', '   *\t*\t* \t'])('accepts ASCII spaces and tabs between markers: %j', source => {
    expect(fromMarkdown(source).content).toEqual([{ type: 'horizontalRule' }]);
  });

  it.each(['\u00a0---', '---\u00a0', '*\u00a0*\u00a0*', '\f---', '---\v', '*- *', '\\***'])('does not consume non-rule text as a thematic break: %j', source => {
    expect(fromMarkdown(source).content.every(block => block.type !== 'horizontalRule')).toBe(true);
  });

  it.each(['* * *', '- - -', '*\t*\t*', '___'])('interrupts a list with an outer thematic break: %j', rule => {
    const doc = fromMarkdown(`* First\n${rule}\n* Second`);
    expect(doc.content.map(block => block.type)).toEqual(['list', 'horizontalRule', 'list']);
    expect(toHTML(doc)).toBe('<ul><li><p>First</p></li></ul><hr><ul><li><p>Second</p></li></ul>');
    expect(fromMarkdown(toMarkdown(doc))).toEqual(doc);
  });

  it('keeps a thematic break inside an explicitly marked list item', () => {
    const doc = fromMarkdown('- First\n- * * *');
    expect(toHTML(doc)).toBe('<ul><li><p>First</p></li><li><hr></li></ul>');
    expect(fromMarkdown(toMarkdown(doc))).toEqual(doc);
  });

  it('round-trips a bullet list whose first item contains only a rule', () => {
    const doc = fromMarkdown('- ***');
    expect(toHTML(doc)).toBe('<ul><li><hr></li></ul>');
    expect(toMarkdown(doc)).toBe('- ***');
    expect(fromMarkdown(toMarkdown(doc))).toEqual(doc);
  });

  it.each(['  * * *', '   * * *', '  -\t-\t-'])('keeps an indented thematic break inside the preceding list item: %j', rule => {
    const doc = fromMarkdown(`* First\n${rule}\n* Second`);
    expect(toHTML(doc)).toBe('<ul><li><p>First</p><hr></li><li><p>Second</p></li></ul>');
    expect(fromMarkdown(toMarkdown(doc))).toEqual(doc);
  });

  it('retains setext-heading precedence and literal indented code', () => {
    const doc = fromMarkdown('Title\n---\n\n    *\t*\t*\n\n-\t-\t-');
    expect(doc.content).toEqual([
      { type: 'heading', level: 2, content: [{ type: 'text', text: 'Title' }] },
      { type: 'codeBlock', text: '*\t*\t*' },
      { type: 'horizontalRule' },
    ]);
    expect(fromMarkdown(toMarkdown(doc))).toEqual(doc);
  });
});
