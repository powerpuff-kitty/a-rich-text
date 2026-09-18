// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { type ARTDocument } from '../../core/src/index.js';
import { textPoint, textSelection } from '../../engine/src/index.js';
import { renderARTDocument, readDOMSelection, writeDOMSelection, getLogicalTextLength } from '../src/index.js';
import { fromHTML, toHTML } from '../../html/src/index.js';
import { createExtensionRegistry } from '../../extensions/src/index.js';
const atom = { type: 'extensionInline' as const, name: 'acme:mention', fallbackText: '@Alice & Bob', attrs: { id: '42' } };
const art: ARTDocument = { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }, atom, { type: 'text', text: 'b' }] }] };
describe('inline extension DOM and HTML', () => {
  it('round-trips every caret position and reversed selection without entering the atom', () => {
    const root = document.createElement('div'); document.body.append(root);
    renderARTDocument(root, art);
    expect(getLogicalTextLength(root.firstElementChild as HTMLElement)).toBe(3);
    expect(root.querySelector('[data-art-extension-inline]')?.getAttribute('contenteditable')).toBe('false');
    const captured = { anchorNode: null as Node | null, anchorOffset: 0, focusNode: null as Node | null, focusOffset: 0,
      setBaseAndExtent(a: Node, ao: number, f: Node, fo: number) { this.anchorNode = a; this.anchorOffset = ao; this.focusNode = f; this.focusOffset = fo; } };
    for (let offset = 0; offset <= 3; offset++) {
      const selection = textSelection(textPoint([0], offset), textPoint([0], 3 - offset));
      expect(writeDOMSelection(root, selection, captured as unknown as Selection)).toBe(true);
      expect(readDOMSelection(root, captured as unknown as Selection)).toEqual(selection);
    }
    root.remove();
  });
  it('preserves unknown extensions through portable HTML and escapes labels/attributes', () => {
    expect(fromHTML(toHTML(art))).toEqual(art);
    expect(toHTML(art)).toContain('@Alice &amp; Bob');
    expect(() => fromHTML('<p><span data-art-extension-inline="bad" data-art-extension-fallback="x">x</span></p>')).toThrow();
  });
  it('uses registered renderers and preserves data after uninstall', () => {
    const registry = createExtensionRegistry();
    const remove = registry.install({ name: 'acme:people', inlines: [{ name: atom.name,
      validate: node => typeof node.attrs?.id === 'string',
      renderDOM: (_node, context) => { const strong = context.document.createElement('strong'); strong.textContent = 'Person'; return strong; },
      toHTML: () => ({ tagName: 'strong', textContent: 'Person' }),
    }] });
    const root = document.createElement('div');
    renderARTDocument(root, art, { extensions: registry });
    expect(root.querySelector('strong')?.textContent).toBe('Person');
    expect(fromHTML(toHTML(art, { extensions: registry }))).toEqual(art);
    expect(() => registry.install({ name: 'acme:duplicate', blocks: [{ name: atom.name }] })).toThrow();
    remove(); expect(registry.getInline(atom.name)).toBeUndefined();
    renderARTDocument(root, art, { extensions: registry });
    expect(root.textContent).toBe('a@Alice & Bobb');
  });
});

it('rejects malformed attrs instead of accepting the visible label as an atom', () => {
  expect(() => fromHTML('<p><span data-art-extension-inline="acme:mention" data-art-extension-fallback="Alice" data-art-extension-attrs="[]">Alice</span></p>')).toThrow();
});
