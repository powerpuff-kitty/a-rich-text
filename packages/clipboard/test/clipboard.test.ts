// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { clipboardToDocument, plainTextToDocument } from '../src/index.js';

function clipboard(data: Record<string, string>) {
  return {
    types: Object.keys(data),
    getData(format: string) {
      return data[format] ?? '';
    },
  };
}

describe('@arichtext/clipboard', () => {
  it('prefers rich HTML and sanitizes it through ART import', () => {
    const result = clipboardToDocument(clipboard({
      'text/html': '<p><strong>safe</strong><script>alert(1)</script></p>',
      'text/plain': 'fallback',
    }));

    expect(result?.source).toBe('html');
    expect(result?.document.content[0]).toEqual({
      type: 'paragraph',
      content: [{ type: 'text', text: 'safe', marks: [{ type: 'bold' }] }],
    });
  });

  it('falls back to literal plain text without interpreting Markdown', () => {
    const result = clipboardToDocument(clipboard({
      'text/plain': '# not a heading\n**not bold**',
    }));

    expect(result?.source).toBe('text');
    expect(result?.document.content).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: '# not a heading' }] },
      { type: 'paragraph', content: [{ type: 'text', text: '**not bold**' }] },
    ]);
  });

  it('preserves empty lines as empty paragraphs', () => {
    expect(plainTextToDocument('one\n\nthree').content).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'one' }] },
      { type: 'paragraph', content: [] },
      { type: 'paragraph', content: [{ type: 'text', text: 'three' }] },
    ]);
  });

  it('returns null for non-text clipboard payloads', () => {
    expect(clipboardToDocument(clipboard({ 'image/png': '' }))).toBeNull();
  });
});
