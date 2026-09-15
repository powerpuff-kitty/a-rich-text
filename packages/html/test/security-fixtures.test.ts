// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { createExtensionRegistry } from '../../extensions/src/index.js';
import { sanitizeHTML, toHTML } from '../src/index.js';

const SCRIPT_SCHEMES = [
  'javascript:alert(1)',
  'JaVaScRiPt:alert(1)',
  '  javascript:alert(1)',
  'java\nscript:alert(1)',
  'vbscript:msgbox(1)',
  'data:text/html,<script>alert(1)</script>',
];

describe('@arichtext/html security fixtures', () => {
  it('drops executable/embedded elements and event/style attributes', () => {
    const output = sanitizeHTML([
      '<script>alert(1)</script>',
      '<style>body{display:none}</style>',
      '<iframe src="https://example.com"></iframe>',
      '<object data="https://example.com"></object>',
      '<embed src="https://example.com">',
      '<template><img src=x onerror=alert(1)></template>',
      '<p class="evil" style="color:red" onclick="alert(1)">safe</p>',
    ].join(''));

    expect(output).toContain('<p>safe</p>');
    for (const forbidden of ['<script', '<style', '<iframe', '<object', '<embed', '<template', 'onclick=', 'style=', 'class=']) {
      expect(output.toLowerCase()).not.toContain(forbidden);
    }
  });

  it.each(SCRIPT_SCHEMES)('removes unsafe link scheme %s', (href) => {
    const output = sanitizeHTML(`<p><a href="${escapeAttributeFixture(href)}">link</a></p>`);
    expect(output).toBe('<p>link</p>');
  });

  it('decodes character references before URL protocol validation', () => {
    const output = sanitizeHTML('<p><a href="jav&#x61;script:alert(1)">unsafe</a></p>');
    expect(output).toBe('<p>unsafe</p>');
  });

  it('rejects data images by default and allows only explicit image data when opted in', () => {
    expect(sanitizeHTML('<img src="data:image/png;base64,AAAA" alt="x">')).toBe('');
    expect(sanitizeHTML('<img src="data:text/html;base64,AAAA" alt="x">', { allowDataImages: true })).toBe('');
    expect(sanitizeHTML('<img src="data:image/png;base64,AAAA" alt="x">', { allowDataImages: true }))
      .toBe('<img src="data:image/png;base64,AAAA" alt="x">');
  });

  it('keeps dangerous-looking text literal while removing executable event attributes', () => {
    const output = sanitizeHTML([
      '<p>&lt;img src=x onerror=alert(1)&gt;</p>',
      '<img src="/safe.png" alt="safe" onerror="alert(1)" onclick="alert(2)">',
    ].join(''));

    expect(output).toContain('&lt;img src=x onerror=alert(1)&gt;');
    const parsed = new DOMParser().parseFromString(output, 'text/html');
    for (const element of Array.from(parsed.body.querySelectorAll('*'))) {
      for (const attribute of Array.from(element.attributes)) {
        expect(attribute.name.toLowerCase().startsWith('on')).toBe(false);
      }
    }
    expect(parsed.body.querySelector('img')?.getAttribute('src')).toBe('/safe.png');
  });

  it('rejects executable tags and dangerous attributes from extension descriptors', () => {
    const node = { type: 'extensionBlock' as const, name: 'acme:card', fallbackText: 'safe' };

    const badTag = createExtensionRegistry([{
      name: 'acme:bad-tag',
      blocks: [{ name: 'acme:card', toHTML: () => ({ tagName: 'script' }) }],
    }]);
    expect(() => toHTML({ type: 'doc', version: 1, content: [node] }, { extensions: badTag }))
      .toThrow(/Unsafe extension HTML tag/);

    for (const attributes of [
      { onclick: 'alert(1)' },
      { style: 'background:url(javascript:alert(1))' },
      { srcdoc: '<script>alert(1)</script>' },
    ]) {
      const registry = createExtensionRegistry([{
        name: 'acme:bad-attr',
        blocks: [{ name: 'acme:card', toHTML: () => ({ tagName: 'div', attributes }) }],
      }]);
      expect(() => toHTML({ type: 'doc', version: 1, content: [node] }, { extensions: registry }))
        .toThrow(/Unsafe extension HTML attribute|Event-handler attributes/);
    }
  });

  it('applies URL allowlists to extension descriptor href/src', () => {
    const link = createExtensionRegistry([{
      name: 'acme:link',
      blocks: [{
        name: 'acme:card',
        toHTML: () => ({ tagName: 'a', attributes: { href: 'JaVaScRiPt:alert(1)' } }),
      }],
    }]);
    expect(() => toHTML({
      type: 'doc', version: 1, content: [{ type: 'extensionBlock', name: 'acme:card' }],
    }, { extensions: link })).toThrow(/Unsafe extension href/);

    const image = createExtensionRegistry([{
      name: 'acme:image',
      blocks: [{
        name: 'acme:card',
        toHTML: () => ({ tagName: 'img', attributes: { src: 'data:text/html,<script>x</script>' } }),
      }],
    }]);
    expect(() => toHTML({
      type: 'doc', version: 1, content: [{ type: 'extensionBlock', name: 'acme:card' }],
    }, { extensions: image })).toThrow(/Unsafe extension src/);
  });
});

function escapeAttributeFixture(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
}
