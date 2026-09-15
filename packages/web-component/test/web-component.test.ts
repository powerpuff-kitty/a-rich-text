// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest';
import { ARichTextElement } from '../src/index.js';

describe('<a-rich-text>', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('moves between HTML, ART JSON, Markdown and plain text', () => {
    const editor = document.createElement('a-rich-text') as ARichTextElement;
    document.body.append(editor);

    editor.setHTML('<h2>Hello <strong>world</strong></h2>');

    expect(editor.getText()).toBe('Hello world');
    expect(editor.getHTML()).toBe('<h2>Hello <strong>world</strong></h2>');
    expect(editor.getMarkdown()).toBe('## Hello **world**');
    expect(editor.getJSON().content[0]).toMatchObject({ type: 'heading', level: 2 });

    editor.setMarkdown('- [x] Browser first');
    expect(editor.getHTML()).toContain('data-art-list="task"');
    expect(editor.getText()).toBe('Browser first');
  });

  it('sanitizes HTML before inserting it into the editable surface', () => {
    const editor = document.createElement('a-rich-text') as ARichTextElement;
    document.body.append(editor);

    editor.setHTML('<p><a href="javascript:alert(1)">link</a></p><script>alert(1)</script>');

    expect(editor.getHTML()).toBe('<p>link</p>');
  });
});
