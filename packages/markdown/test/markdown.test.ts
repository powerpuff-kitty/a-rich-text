import { describe, expect, it } from 'vitest';
import { fromMarkdown, toMarkdown } from '../src/index.js';

describe('@arichtext/markdown', () => {
  it('resolves reference-style links', () => {
    const document = fromMarkdown('[docs][guide]\n\n[guide]: https://example.com/docs');
    expect(document.content[0]).toMatchObject({ content: [{ marks: [{ type: 'link', href: 'https://example.com/docs' }] }] });
  });
  it('resolves shortcut reference links', () => {
    const document = fromMarkdown('[guide]\n\n[guide]: https://example.com/docs');
    expect(document.content[0]).toMatchObject({ content: [{ marks: [{ type: 'link', href: 'https://example.com/docs' }] }] });
  });
  it('keeps inline links ahead of shortcut references', () => {
    const document = fromMarkdown('[guide](https://inline.example)\n\n[guide]: https://reference.example');
    expect(document.content[0]).toMatchObject({ content: [{ marks: [{ type: 'link', href: 'https://inline.example' }] }] });
  });
  it('parses and serializes common document structures', () => {
    const source = [
      '## Hello **world**',
      '',
      '- [x] Ship editor',
      '- [ ] Add cloud',
      '',
      '> Portable by default.',
      '',
      '```ts',
      'const ready = true;',
      '```',
    ].join('\n');

    const document = fromMarkdown(source);

    expect(document.content.map((block) => block.type)).toEqual([
      'heading',
      'list',
      'blockquote',
      'codeBlock',
    ]);
    expect(toMarkdown(document)).toContain('## Hello **world**');
    expect(toMarkdown(document)).toContain('- [x] Ship editor');
    expect(toMarkdown(document)).toContain('```ts');
  });

  it('removes unsafe link semantics while preserving link text', () => {
    const document = fromMarkdown('[safe](https://arichtext.com) [unsafe](javascript:alert(1))');
    const paragraph = document.content[0];

    expect(paragraph).toMatchObject({ type: 'paragraph' });
    expect(toMarkdown(document)).toBe('[safe](https://arichtext.com) unsafe');
  });

  it('round-trips simple pipe tables', () => {
    const source = [
      '| Name | Value |',
      '| --- | --- |',
      '| Format | ART |',
      '| Runtime | Browser |',
    ].join('\n');

    const document = fromMarkdown(source);
    expect(document.content[0]).toMatchObject({ type: 'table' });
    expect(toMarkdown(document)).toBe(source);
  });
});
