import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fromMarkdown, toMarkdown } from '../src/index.js';
import { toHTML } from '../../html/src/index.js';

interface Fixture { example: number; markdown: string; html: string }
const fixtures: Fixture[] = JSON.parse(readFileSync(new URL('./fixtures/commonmark-0.31.2-fenced-code.json', import.meta.url), 'utf8'));
// ART omits the final code line terminator. Preserve all other code whitespace;
// normalize HTML block separators and soft breaks only outside pre elements.
const expectedHTML = (html: string) => html.trimEnd().replace(/\n<\/code>/g, '</code>').replace(/>\n</g, '><').replace(/(<pre>[\s\S]*?<\/pre>)|\n/g, (match, code: string | undefined) => code ?? ' ');

describe('CommonMark fenced code blocks', () => {
  it('accounts for every upstream example', () => {
    expect(fixtures.map(f => f.example)).toEqual(Array.from({ length: 29 }, (_, i) => 119 + i));
  });
  for (const fixture of fixtures) {
    it(`matches upstream example ${fixture.example}`, () => {
      expect(toHTML(fromMarkdown(fixture.markdown))).toBe(expectedHTML(fixture.html));
    });
  }
  it.each(['```\ntext', '```\ntext\n', '```\ntext\n\n', '~~~a`b\ntext\n~~~', '  ~~~js metadata\n   code\n  ~~~'])('round-trips canonical code for %j', source => {
    const doc = fromMarkdown(source);
    expect(fromMarkdown(toMarkdown(doc))).toEqual(doc);
  });
  it('removes opening indentation from tabs without losing remaining columns', () => {
    expect(fromMarkdown('  ```\n\tx\n \tx\n  \tx\n```').content).toEqual([{ type: 'codeBlock', text: '  x\n  x\n\tx' }]);
  });
  it('requires ASCII spaces before fences and ASCII spaces/tabs after closers', () => {
    expect(fromMarkdown('\u00a0```\ntext').content[0]?.type).toBe('paragraph');
    expect(fromMarkdown('```\nx\n```\u00a0\ny\n```').content).toEqual([{ type: 'codeBlock', text: 'x\n```\u00a0\ny' }]);
    expect(fromMarkdown('```\nx\n\t```\ny\n```').content).toEqual([{ type: 'codeBlock', text: 'x\n\t```\ny' }]);
  });
});
