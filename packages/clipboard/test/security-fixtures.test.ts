// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { clipboardToDocument, normalizeClipboardHTML } from '../src/index.js';

function clipboard(data: Record<string, string>) {
  return {
    types: Object.keys(data),
    getData(format: string) {
      return data[format] ?? '';
    },
  };
}

describe('@arichtext/clipboard security fixtures', () => {
  it('preserves only the safe office-style formatting subset', () => {
    const normalized = normalizeClipboardHTML([
      '<p class="MsoNormal" style="font-weight:700;color:red" onclick="alert(1)">',
      '<span style="font-style:italic;text-decoration:underline line-through;background:url(javascript:alert(1))" onmouseover="x()">Safe</span>',
      '</p>',
    ].join(''));

    expect(normalized).toContain('<strong>');
    expect(normalized).toContain('<em>');
    expect(normalized).toContain('<u>');
    expect(normalized).toContain('<s>');
    expect(normalized).not.toContain('class=');
    expect(normalized).not.toContain('style=');
    expect(normalized).not.toContain('onclick=');
    expect(normalized).not.toContain('onmouseover=');
  });

  it('routes normalized rich HTML through the normal ART sanitizer', () => {
    const result = clipboardToDocument(clipboard({
      'text/html': [
        '<p><span style="font-weight:700" onclick="x()">safe</span>',
        '<a href="javascript:alert(1)">link</a>',
        '<script>alert(1)</script></p>',
      ].join(''),
      'text/plain': 'fallback',
    }));

    expect(result?.source).toBe('html');
    expect(result?.document.content[0]).toEqual({
      type: 'paragraph',
      content: [
        { type: 'text', text: 'safe', marks: [{ type: 'bold' }] },
        { type: 'text', text: 'link' },
      ],
    });
  });

  it('does not interpret Markdown or HTML when only plain text is available', () => {
    const result = clipboardToDocument(clipboard({
      'text/plain': '<script>alert(1)</script> **bold**',
    }));

    expect(result?.document.content).toEqual([{
      type: 'paragraph',
      content: [{ type: 'text', text: '<script>alert(1)</script> **bold**' }],
    }]);
  });
});
