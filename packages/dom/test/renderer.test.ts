// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest';
import { ART_DOCUMENT_VERSION, type ARTDocument } from '../../core/src/index.js';
import {
  ART_BLOCK_PATH_ATTRIBUTE,
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
});
