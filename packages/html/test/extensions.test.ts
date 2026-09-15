// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { createExtensionRegistry } from '../../extensions/src/index.js';
import { fromHTML, toHTML } from '../src/index.js';

function registry() {
  return createExtensionRegistry([
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
      marks: [{
        name: 'acme:mention',
        toHTML: (mark) => ({
          tagName: 'span',
          attributes: { 'data-user-id': String(mark.attrs?.userId ?? '') },
        }),
        fromHTML(element) {
          if (!element.hasAttribute('data-user-id')) return null;
          return {
            type: 'extensionMark',
            name: 'acme:mention',
            attrs: { userId: element.getAttribute('data-user-id') ?? '' },
          };
        },
      }],
    },
  ]);
}

describe('@arichtext/html extension hooks', () => {
  it('serializes registered extensions as semantic safe HTML', () => {
    const output = toHTML({
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
          fallbackText: 'Property one',
        },
      ],
    }, { extensions: registry() });

    expect(output).toBe('<p><span data-user-id="u1">Alice</span></p><article data-property-id="p1">Property one</article>');
  });

  it('parses registered semantic HTML back into portable extension envelopes', () => {
    const document = fromHTML(
      '<p>Hello <span data-user-id="u7">Alice</span></p><article data-property-id="p9">Nine</article>',
      { extensions: registry() },
    );

    expect(document.content[0]).toEqual({
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Hello ' },
        {
          type: 'text',
          text: 'Alice',
          marks: [{ type: 'extensionMark', name: 'acme:mention', attrs: { userId: 'u7' } }],
        },
      ],
    });
    expect(document.content[1]).toEqual({
      type: 'extensionBlock',
      name: 'acme:property-card',
      attrs: { propertyId: 'p9' },
      fallbackText: 'Nine',
    });
  });

  it('keeps generic extension envelopes portable without a registry', () => {
    const input = {
      type: 'doc' as const,
      version: 1 as const,
      content: [{
        type: 'extensionBlock' as const,
        name: 'acme:property-card',
        attrs: { propertyId: 'p1' },
        fallbackText: 'Fallback',
      }],
    };
    const html = toHTML(input);
    expect(html).toContain('data-art-extension-block="acme:property-card"');
    expect(fromHTML(html).content[0]).toEqual(input.content[0]);
  });

  it('rejects unsafe URLs from custom descriptors too', () => {
    const unsafe = createExtensionRegistry([{ name: 'acme:unsafe', blocks: [{
      name: 'acme:link-card',
      toHTML: () => ({ tagName: 'a', attributes: { href: 'javascript:alert(1)' } }),
    }] }]);

    expect(() => toHTML({
      type: 'doc',
      version: 1,
      content: [{ type: 'extensionBlock', name: 'acme:link-card' }],
    }, { extensions: unsafe })).toThrow(/Unsafe extension href/);
  });
});
