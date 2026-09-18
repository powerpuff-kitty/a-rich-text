// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isARTDocument } from '../../core/src/index.js';
import { fromHTML, toHTML } from '../../html/src/index.js';
import { fromMarkdown, toMarkdown } from '../src/index.js';

interface Fixture { example: number; markdown: string; html: string }
const fixtures: Fixture[] = JSON.parse(readFileSync('packages/markdown/test/fixtures/commonmark-0.31.2-list-markers.json', 'utf8'));
// Compare retained ART semantics: list tightness is not stored; soft breaks fold.
const expectedDocument = (fixture: Fixture) => fromHTML(fixture.html.replace(/>\n</g, '><').replaceAll('\n', ' ').trimEnd());

describe('CommonMark list marker boundaries', () => {
  it('accounts for the selected upstream marker examples', () => {
    expect(fixtures.map(f => f.example)).toEqual([265, 266, 267, 268, 269, 281, 282, 283, 284, 285, 303, 304, 305]);
  });
  for (const fixture of fixtures) {
    it(`matches retained ART semantics for example ${fixture.example}`, () => {
      const doc = fromMarkdown(fixture.markdown);
      expect(isARTDocument(doc)).toBe(true);
      expect(doc).toEqual(expectedDocument(fixture));
      expect(fromMarkdown(toMarkdown(doc))).toEqual(doc);
      if (fixture.example === 267) {
        // ART requires positive starts; zero intentionally normalizes to one.
        expect(toHTML(doc)).not.toContain('start="0"');
      }
    });
  }
  it.each(['2. item', '0) item', '999999999. item', '1234567890. item', '*', '*   ', '+\t', '1.', '1) \t'])('keeps non-interrupting marker text in paragraphs: %j', line => {
    const source = `first\n${line}`;
    const doc = fromMarkdown(source);
    expect(doc.content).toHaveLength(1);
    expect(doc.content[0]?.type).toBe('paragraph');
    expect(fromMarkdown(toMarkdown(doc))).toEqual(doc);
    expect(fromMarkdown(`> first\n${line}`).content[0]).toEqual({ type: 'blockquote', content: doc.content });
  });
  it.each(['1. item', '01) item', '- item', '+ item', '* item', '- [x] task', '- [x] '])('allows nonempty bullet/task or start-one markers to interrupt: %j', line => {
    const doc = fromMarkdown(`first\n${line}`);
    expect(doc.content.map(n => n.type)).toEqual(['paragraph', 'list']);
    expect(fromMarkdown(`> first\n${line}`).content.map(n => n.type)).toEqual(['blockquote', 'list']);
  });
  it.each(['*', '+', '-', '1.', '2)', '* \t'])('preserves an isolated empty list item: %j', source => {
    const doc = fromMarkdown(source);
    expect(doc.content[0]?.type).toBe('list');
    expect(fromMarkdown(toMarkdown(doc))).toEqual(doc);
  });
  it.each(['- first\u2028second', '1. first\u2029second', '- [x] first\u2028second'])('preserves Unicode separators in item text: %j', source => {
    const doc = fromMarkdown(source);
    expect(doc.content[0]?.type).toBe('list');
    expect(fromMarkdown(toMarkdown(doc))).toEqual(doc);
  });
  it('keeps non-one list starts after blank lines and after tables', () => {
    expect(fromMarkdown('first\n\n14. item').content.map(n => n.type)).toEqual(['paragraph', 'list']);
    expect(fromMarkdown('| head |\n| --- |\n14. item').content.map(n => n.type)).toEqual(['table', 'list']);
  });
  it('round-trips lists whose later item numbers exceed nine digits', () => {
    const doc = fromMarkdown('999999999. first\n1. second');
    expect(fromMarkdown(toMarkdown(doc))).toEqual(doc);
  });
});
