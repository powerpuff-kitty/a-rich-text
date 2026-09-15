// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest';
import { ART_DOCUMENT_VERSION, type ARTDocument } from '../../core/src/index.js';
import { createExtensionRegistry } from '../../extensions/src/index.js';
import {
  ART_BLOCK_PATH_ATTRIBUTE,
  ART_EXTENSION_ATTRS_ATTRIBUTE,
  ART_EXTENSION_BLOCK_ATTRIBUTE,
  ART_EXTENSION_FALLBACK_ATTRIBUTE,
  ART_EXTENSION_MARK_ATTRIBUTE,
  getLogicalTextLength,
  renderARTDocument,
} from '../src/index.js';

let root: HTMLDivElement;

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
  root = document.querySelector<HTMLDivElement>('#root')!;
});

describe('@arichtext/dom rendering', () => {
  it('renders text and marks without interpreting document text as HTML', () => {
    const art: ARTDocument = {
      type: 'doc',
      version: ART_DOCUMENT_VERSION,
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: '<img src=x onerror=alert(1)> ' },
          { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
          { type: 'text', text: '\nlink', marks: [{ type: 'link', href: 'https://arichtext.com' }] },
        ],
      }],
    };

    renderARTDocument(root, art);

    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('strong')?.textContent).toBe('bold');
    expect(root.querySelector('a')?.getAttribute('href')).toBe('https://arichtext.com');
    expect(root.querySelector('br')).not.toBeNull();
    expect(root.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(getLogicalTextLength(root.querySelector('p')!)).toBe('<img src=x onerror=alert(1)> bold\nlink'.length);
  });

  it('drops unsafe link semantics while preserving text', () => {
    const art: ARTDocument = {
      type: 'doc',
      version: ART_DOCUMENT_VERSION,
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: 'unsafe', marks: [{ type: 'link', href: 'javascript:alert(1)' }] }],
      }],
    };

    renderARTDocument(root, art);
    expect(root.querySelector('a')).toBeNull();
    expect(root.textContent).toBe('unsafe');
  });

  it('annotates nested list and table text blocks with engine paths', () => {
    const art: ARTDocument = {
      type: 'doc',
      version: ART_DOCUMENT_VERSION,
      content: [
        {
          type: 'list',
          style: 'bullet',
          content: [{
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'list' }] }],
          }],
        },
        {
          type: 'table',
          content: [{
            type: 'tableRow',
            content: [{
              type: 'tableCell',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'cell' }] }],
            }],
          }],
        },
      ],
    };

    renderARTDocument(root, art);
    const paragraphs = [...root.querySelectorAll('p')];
    expect(paragraphs[0]?.getAttribute(ART_BLOCK_PATH_ATTRIBUTE)).toBe('0.0.0');
    expect(paragraphs[1]?.getAttribute(ART_BLOCK_PATH_ATTRIBUTE)).toBe('1.0.0.0');
  });

  it('preserves portable extension attrs/fallbacks in DOM wrappers', () => {
    const art: ARTDocument = {
      type: 'doc',
      version: ART_DOCUMENT_VERSION,
      content: [
        {
          type: 'paragraph',
          content: [{
            type: 'text',
            text: 'Alice',
            marks: [{
              type: 'extensionMark',
              name: 'acme:mention',
              attrs: { z: 2, userId: 'u1' },
            }],
          }],
        },
        {
          type: 'extensionBlock',
          name: 'acme:card',
          attrs: { b: 2, a: 1 },
          fallbackText: 'Card fallback',
        },
      ],
    };

    renderARTDocument(root, art);

    const mark = root.querySelector(`[${ART_EXTENSION_MARK_ATTRIBUTE}]`)!;
    expect(mark.getAttribute(ART_EXTENSION_MARK_ATTRIBUTE)).toBe('acme:mention');
    expect(mark.getAttribute(ART_EXTENSION_ATTRS_ATTRIBUTE)).toBe('{"userId":"u1","z":2}');

    const block = root.querySelector(`[${ART_EXTENSION_BLOCK_ATTRIBUTE}]`)!;
    expect(block.getAttribute(ART_EXTENSION_BLOCK_ATTRIBUTE)).toBe('acme:card');
    expect(block.getAttribute(ART_EXTENSION_ATTRS_ATTRIBUTE)).toBe('{"a":1,"b":2}');
    expect(block.getAttribute(ART_EXTENSION_FALLBACK_ATTRIBUTE)).toBe('Card fallback');
    expect(block.textContent).toBe('Card fallback');
  });

  it('uses installed extension renderers inside portable wrappers', () => {
    const registry = createExtensionRegistry([{ name: 'acme:content', blocks: [{
      name: 'acme:card',
      renderDOM(node, { document }) {
        const card = document.createElement('article');
        card.dataset.id = String(node.attrs?.id ?? '');
        card.textContent = 'Custom card';
        return card;
      },
    }], marks: [{
      name: 'acme:mention',
      renderDOM(mark, { document }) {
        const mention = document.createElement('mark');
        mention.dataset.id = String(mark.attrs?.id ?? '');
        return mention;
      },
    }] }]);

    renderARTDocument(root, {
      type: 'doc',
      version: 1,
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'A', marks: [{ type: 'extensionMark', name: 'acme:mention', attrs: { id: 'u1' } }] }] },
        { type: 'extensionBlock', name: 'acme:card', attrs: { id: 'c1' }, fallbackText: 'Fallback' },
      ],
    }, { extensions: registry });

    expect(root.querySelector('mark')?.getAttribute('data-id')).toBe('u1');
    expect(root.querySelector('article')?.getAttribute('data-id')).toBe('c1');
    expect(root.querySelector('article')?.closest(`[${ART_EXTENSION_BLOCK_ATTRIBUTE}]`)?.getAttribute(ART_EXTENSION_ATTRS_ATTRIBUTE)).toBe('{"id":"c1"}');
  });
});
