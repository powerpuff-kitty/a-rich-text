// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import { ARichTextElement } from '../../web-component/src/index.js';
import { enableCodeHighlighting } from '../src/highlight.js';
afterEach(() => { document.body.replaceChildren(); });
it('decorates safe text, follows canonical updates and leaves exports/history untouched', async () => {
  const editor = document.createElement('a-rich-text') as ARichTextElement;
  document.body.append(editor);
  editor.setHTML('<pre><code class="language-js">const text = "&lt;img src=x onerror=alert(1)&gt;";</code></pre>');
  const before = { html: editor.getHTML(), json: editor.getJSON(), undo: editor.canUndo };
  const controller = enableCodeHighlighting(editor);
  expect(editor.shadowRoot!.querySelector('[data-art-token=keyword]')?.textContent).toBe('const');
  expect(editor.shadowRoot!.querySelector('code img')).toBeNull();
  expect({ html: editor.getHTML(), json: editor.getJSON(), undo: editor.canUndo }).toEqual(before);
  editor.setHTML('<pre><code class="language-json">{"count":42}</code></pre>');
  controller.refresh();
  expect(editor.shadowRoot!.querySelector('[data-art-token=number]')?.textContent).toBe('42');
  const html = editor.getHTML(); controller.destroy();
  expect(editor.shadowRoot!.querySelector('[data-art-token]')).toBeNull();
  expect(editor.getHTML()).toBe(html);
});
it('keeps unknown languages and oversized blocks plain', () => {
  const editor = document.createElement('a-rich-text') as ARichTextElement;
  document.body.append(editor);
  editor.setHTML('<pre><code class="language-rust">let number = 42;</code></pre>');
  const controller = enableCodeHighlighting(editor);
  expect(editor.shadowRoot!.querySelector('[data-art-token]')).toBeNull();
  editor.setHTML(`<pre><code class="language-js">const text = "${'x'.repeat(100_001)}";</code></pre>`);
  controller.refresh();
  expect(editor.shadowRoot!.querySelector('[data-art-token]')).toBeNull();
  controller.destroy();
});
