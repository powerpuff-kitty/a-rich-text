// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ARTDocument, ARTListNode } from '../../core/src/index.js';
import { fromHTML } from '../../html/src/index.js';
import { fromMarkdown, toMarkdown } from '../src/index.js';

interface Fixture { example: number; markdown: string; html: string }
const fixtures: Fixture[] = JSON.parse(readFileSync('packages/markdown/test/fixtures/commonmark-0.31.2-list-grouping.json', 'utf8'));
const expectedDocument = (fixture: Fixture) => fromHTML(fixture.html.replace(/>\n</g, '><').replaceAll('\n', ' ').trimEnd());

describe('CommonMark list grouping', () => {
  it('tracks the three selected upstream grouping examples', () => {
    expect(fixtures.map(f => f.example)).toEqual([301, 302, 306]);
  });
  for (const fixture of fixtures) {
    it(`matches retained ART list structure for example ${fixture.example}`, () => {
      const doc = fromMarkdown(fixture.markdown);
      expect(doc).toEqual(expectedDocument(fixture));
      expect(fromMarkdown(toMarkdown(doc))).toEqual(doc);
    });
  }
  it.each(['- a\n+ b', '+ a\n* b', '* a\n- b', '- a\n\n+ b', '1. a\n2) b', '2) a\n\n3. b', '- [x] a\n+ [ ] b'])('splits lists when marker spelling changes: %j', source => {
    const doc = fromMarkdown(source);
    expect(doc.content.map(n => n.type)).toEqual(['list', 'list']);
    expect(fromMarkdown(toMarkdown(doc))).toEqual(doc);
  });
  it.each(['- a\n- b', '+ a\n\n+ b', '* a\n\n\n* b', '4) a\n9) b', '- [x] a\n- [ ] b'])('retains one list for matching markers: %j', source => {
    const doc = fromMarkdown(source);
    expect(doc.content).toHaveLength(1);
    expect(doc.content[0]?.type).toBe('list');
    expect((doc.content[0] as ARTListNode).content).toHaveLength(2);
  });
  it.each(['bullet', 'ordered', 'task'] as const)('preserves three adjacent %s lists in root, quote and list-item containers', style => {
    const makeList = (text: string): ARTListNode => ({ type: 'list', style, ...(style === 'ordered' ? { start: 7 } : {}), content: [{ type: 'listItem', ...(style === 'task' ? { checked: true } : {}), content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }] });
    const lists = ['one', 'two', 'three'].map(makeList);
    const documents: ARTDocument[] = [
      { type: 'doc', version: 1, content: lists },
      { type: 'doc', version: 1, content: [{ type: 'blockquote', content: lists }] },
      { type: 'doc', version: 1, content: [{ type: 'list', style: 'bullet', content: [{ type: 'listItem', content: lists }] }] },
    ];
    for (const doc of documents) expect(fromMarkdown(toMarkdown(doc))).toEqual(doc);
  });
  it('keeps a leading thematic break inside adjacent bullet lists', () => {
    const list: ARTListNode = { type: 'list', style: 'bullet', content: [{ type: 'listItem', content: [{ type: 'horizontalRule' }] }] };
    const doc: ARTDocument = { type: 'doc', version: 1, content: [list, list, list] };
    expect(fromMarkdown(toMarkdown(doc))).toEqual(doc);
  });
});
