// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { clipboardToDocument, normalizeClipboardHTML, plainTextToDocument } from '../src/index.js';

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

  it('preserves only the safe office-style formatting subset', () => {
    const result = clipboardToDocument(clipboard({
      'text/html': [
        '<p>',
        '<span class="MsoNormal" style="font-weight:700;color:red;position:absolute">Bold</span>',
        '<span style="font-style:italic">Italic</span>',
        '<span style="text-decoration:underline line-through" onclick="boom()">Both</span>',
        '</p>',
      ].join(''),
    }));

    expect(result?.document.content[0]).toEqual({
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Bold', marks: [{ type: 'bold' }] },
        { type: 'text', text: 'Italic', marks: [{ type: 'italic' }] },
        { type: 'text', text: 'Both', marks: [{ type: 'underline' }, { type: 'strike' }] },
      ],
    });

    const normalized = normalizeClipboardHTML('<span class="x" style="font-weight:bold;color:red" onclick="x()">A</span>');
    expect(normalized).toContain('<strong>A</strong>');
    expect(normalized).not.toContain('style=');
    expect(normalized).not.toContain('class=');
    expect(normalized).not.toContain('onclick');
    expect(normalized).not.toContain('color');
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
