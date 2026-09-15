// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createExtensionRegistry } from '../../extensions/src/index.js';
import { ARichTextElement } from '../src/index.js';

beforeEach(() => {
  document.body.innerHTML = '';
  document.getSelection()?.removeAllRanges();
});

function createEditor(): ARichTextElement {
  const editor = document.createElement('a-rich-text') as ARichTextElement;
  document.body.append(editor);
  return editor;
}

describe('<a-rich-text> extension runtime', () => {
  it('uses registered block and mark DOM renderers without storing executable data in ART', () => {
    const registry = createExtensionRegistry([
      {
        name: 'acme:content',
        blocks: [{
          name: 'acme:property-card',
          renderDOM(node, { document }) {
            const element = document.createElement('article');
            element.dataset.propertyId = String(node.attrs?.propertyId ?? '');
            element.textContent = node.fallbackText ?? 'Property';
            return element;
          },
        }],
        marks: [{
          name: 'acme:mention',
          renderDOM(mark, { document }) {
            const element = document.createElement('span');
            element.dataset.userId = String(mark.attrs?.userId ?? '');
            return element;
          },
        }],
      },
    ]);

    const editor = createEditor();
    editor.extensions = registry;
    editor.setJSON({
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [{
            type: 'text',
            text: 'Alice',
            marks: [{ type: 'extensionMark', name: 'acme:mention', attrs: { userId: 'u1' } }],
          }],
        },
        {
          type: 'extensionBlock',
          name: 'acme:property-card',
          attrs: { propertyId: 'p1' },
          fallbackText: 'Property p1',
        },
      ],
    });

    const surface = editor.shadowRoot!.querySelector('[part="editor"]')!;
    expect(surface.querySelector('[data-art-extension-mark="acme:mention"]')?.getAttribute('data-user-id')).toBe('u1');
    expect(surface.querySelector('[data-art-extension-block="acme:property-card"] article')?.getAttribute('data-property-id')).toBe('p1');
    expect(editor.getJSON().content[1]).toMatchObject({ type: 'extensionBlock', name: 'acme:property-card' });
  });

  it('uses safe registered HTML serializers and semantic HTML parsers', () => {
    const registry = createExtensionRegistry([
      {
        name: 'acme:content',
        blocks: [{
          name: 'acme:property-card',
          toHTML: (node) => ({
            tagName: 'article',
            attributes: { 'data-property-id': String(node.attrs?.propertyId ?? '') },
          }),
          fromHTML(element) {
            if (element.tagName !== 'ARTICLE' || !element.hasAttribute('data-property-id')) return null;
            return {
              type: 'extensionBlock',
              name: 'acme:property-card',
              attrs: { propertyId: element.getAttribute('data-property-id') ?? '' },
              fallbackText: element.textContent ?? '',
            };
          },
        }],
      },
    ]);

    const editor = createEditor();
    editor.extensions = registry;
    editor.setJSON({
      type: 'doc',
      version: 1,
      content: [{
        type: 'extensionBlock',
        name: 'acme:property-card',
        attrs: { propertyId: 'p9' },
        fallbackText: 'Nine',
      }],
    });
    expect(editor.getHTML()).toBe('<article data-property-id="p9">Nine</article>');

    editor.setHTML('<article data-property-id="p10">Ten</article>');
    expect(editor.getJSON().content[0]).toEqual({
      type: 'extensionBlock',
      name: 'acme:property-card',
      attrs: { propertyId: 'p10' },
      fallbackText: 'Ten',
    });
  });

  it('runs extension commands explicitly through the installed registry', async () => {
    const run = vi.fn(({ host }) => {
      (host as ARichTextElement).setText('command ran');
      return 'ok';
    });
    const registry = createExtensionRegistry([
      {
        name: 'acme:commands',
        commands: [{ name: 'acme:replace', run }],
      },
    ]);
    const editor = createEditor();
    editor.extensions = registry;

    await expect(editor.runExtensionCommand('acme:replace')).resolves.toBe('ok');
    expect(editor.getText()).toBe('command ran');
    expect(run).toHaveBeenCalledTimes(1);
  });
});
