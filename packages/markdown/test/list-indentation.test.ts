// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fromHTML } from '../../html/src/index.js';
import { fromMarkdown, toMarkdown } from '../src/index.js';

interface Fixture { example: number; markdown: string; html: string }
const fixtures: Fixture[] = JSON.parse(readFileSync('packages/markdown/test/fixtures/commonmark-0.31.2-list-indentation.json', 'utf8'));
// Preserve code whitespace; compare ART structure rather than tight-list wrappers.
const expectedDocument = (fixture: Fixture) => fromHTML(fixture.html.trimEnd().replace(/\n<\/code>/g, '</code>').replace(/>\n</g, '><').replace(/\n(?=<(?:ul|ol)\b)/g, '').replace(/(<pre>[\s\S]*?<\/pre>)|\n/g, (match, code: string | undefined) => code ?? ' '));

describe('CommonMark list content indentation', () => {
  it('tracks the selected indentation examples', () => {
    expect(fixtures.map(f => f.example)).toEqual([...Array.from({ length: 12 }, (_, i) => i + 253), ...Array.from({ length: 11 }, (_, i) => i + 270), 290, 291, 292, 293, 294, 296, 298, 299]);
  });
  for (const fixture of fixtures) {
    it(`matches retained ART structure for example ${fixture.example}`, () => {
      const doc = fromMarkdown(fixture.markdown);
      expect(doc).toEqual(expectedDocument(fixture));
      expect(fromMarkdown(toMarkdown(doc))).toEqual(doc);
    });
  }
  it.each(['9.', '10.', '999999999.'])('retains a nested list below a %s marker', marker => {
    const doc = fromMarkdown(`${marker} first\n${' '.repeat(marker.length + 1)}- nested`);
    expect(doc.content[0]).toMatchObject({ type: 'list', content: [{ content: [{ type: 'paragraph' }, { type: 'list' }] }] });
    expect(fromMarkdown(toMarkdown(doc))).toEqual(doc);
  });
  it('uses each item marker width across a numbering transition', () => {
    const doc = fromMarkdown('9. first\n   continuation\n10. second\n    continuation');
    expect(doc.content[0]).toMatchObject({ type: 'list', start: 9, content: [
      { content: [{ type: 'paragraph', content: [{ type: 'text', text: 'first continuation' }] }] },
      { content: [{ type: 'paragraph', content: [{ type: 'text', text: 'second continuation' }] }] },
    ] });
    expect(fromMarkdown(toMarkdown(doc))).toEqual(doc);
  });
  it('keeps task continuation blocks aligned to the bullet, not the checkbox', () => {
    const doc = fromMarkdown('- [x] first\n\n  > quoted\n\n  ```\n  code\n  ```');
    expect(fromMarkdown(toMarkdown(doc))).toEqual(doc);
    expect(doc.content[0]).toMatchObject({ type: 'list', style: 'task', content: [{ checked: true, content: [{ type: 'paragraph' }, { type: 'blockquote' }, { type: 'codeBlock', text: 'code' }] }] });
  });
  it.each(['1. first\n  continued', '1. first\ncontinued', '> 1. > first\ncontinued'])('retains open paragraph continuation across omitted indentation: %j', source => {
    const doc = fromMarkdown(source);
    expect(doc.content).toHaveLength(1);
    expect(fromMarkdown(toMarkdown(doc))).toEqual(doc);
    expect(toMarkdown(doc)).toContain('first continued');
  });
  it.each(['1. # heading\noutside', '1.     code\noutside', '1. first\n\noutside'])('keeps text after a closed paragraph outside the list: %j', source => {
    expect(fromMarkdown(source).content.map(n => n.type)).toEqual(['list', 'paragraph']);
  });
  it('retains empty sibling items separated by blank lines', () => {
    const doc = fromMarkdown('-\n\n- next');
    expect(doc.content).toHaveLength(1);
    expect(doc.content[0]).toMatchObject({ type: 'list', content: [{ content: [{ type: 'paragraph', content: [] }] }, { content: [{ type: 'paragraph', content: [{ type: 'text', text: 'next' }] }] }] });
    expect(fromMarkdown(toMarkdown(doc))).toEqual(doc);
  });
  it.each(['-\tfirst\n\tsecond', '10.\tfirst\n\tsecond', '- \tfirst\n    second'])('uses four-column tab stops for item content: %j', source => {
    const doc = fromMarkdown(source);
    expect(doc.content[0]).toMatchObject({ type: 'list', content: [{ content: [{ type: 'paragraph', content: [{ type: 'text', text: 'first second' }] }] }] });
    expect(fromMarkdown(toMarkdown(doc))).toEqual(doc);
  });
  it.each([['-\t\tcode', '  code'], ['-     \tcode', '\tcode'], ['- first\n\n\t\tcode', '  code']])('retains code padding and literal tabs in %j', (source, text) => {
    const doc = fromMarkdown(source!);
    expect(doc.content[0]).toMatchObject({ type: 'list', content: [{ content: expect.arrayContaining([{ type: 'codeBlock', text }]) }] });
    expect(fromMarkdown(toMarkdown(doc))).toEqual(doc);
  });
  it('handles long alternating indented and lazy paragraph continuations', () => {
    const source = '1. first\n' + Array.from({ length: 2000 }, (_, index) => (index % 2 ? '' : '   ') + 'word').join('\n');
    expect(fromMarkdown(source).content[0]).toMatchObject({ type: 'list', content: [{ content: [{ type: 'paragraph', content: [{ type: 'text', text: 'first ' + Array(2000).fill('word').join(' ') }] }] }] });
  });
  it('retains the block after a long run of blank lines', () => {
    expect(fromMarkdown('1. first\n' + '\n'.repeat(2000) + '   second').content[0]).toMatchObject({ type: 'list', content: [{ content: [{ type: 'paragraph', content: [{ type: 'text', text: 'first' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'second' }] }] }] });
  });
});
