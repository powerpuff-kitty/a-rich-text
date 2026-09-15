// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';
import { createExtensionRegistry, ExtensionConflictError, normalizeKeyBinding } from '../src/index.js';

const block = { name: 'acme:property-card' } as const;
const mark = { name: 'acme:mention' } as const;

describe('@arichtext/extensions registry', () => {
  it('installs and resolves blocks, marks, commands and keybindings deterministically', async () => {
    const run = vi.fn(() => 'ok');
    const extension = {
      name: 'acme:properties',
      blocks: [block],
      marks: [mark],
      commands: [{ name: 'acme:insert-property', run }],
      keybindings: [{ key: 'mod-shift-p', command: 'acme:insert-property' }],
    } as const;

    const registry = createExtensionRegistry([extension]);

    expect(registry.extensions.map((item) => item.name)).toEqual(['acme:properties']);
    expect(registry.getBlock('acme:property-card')).toBe(block);
    expect(registry.getMark('acme:mention')).toBe(mark);
    expect(registry.getKeyBinding('Mod-Shift-P')).toEqual({ key: 'mod-shift-p', command: 'acme:insert-property' });
    await expect(registry.runCommand('acme:insert-property', { editor: true })).resolves.toBe('ok');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('rejects duplicate extension resources before mutating registry state', () => {
    const registry = createExtensionRegistry([{ name: 'acme:one', blocks: [block] }]);
    expect(() => registry.install({ name: 'acme:two', blocks: [block] })).toThrowError(ExtensionConflictError);
    expect(registry.extensions.map((item) => item.name)).toEqual(['acme:one']);
  });

  it('rolls back registration when onInstall throws', () => {
    const registry = createExtensionRegistry();
    expect(() => registry.install({
      name: 'acme:broken',
      blocks: [block],
      onInstall: () => { throw new Error('boom'); },
    })).toThrow('boom');
    expect(registry.extensions).toHaveLength(0);
    expect(registry.getBlock(block.name)).toBeUndefined();
  });

  it('always removes owned resources when onUninstall throws', () => {
    const registry = createExtensionRegistry([{
      name: 'acme:broken-cleanup',
      blocks: [block],
      onUninstall: () => { throw new Error('cleanup failed'); },
    }]);

    expect(() => registry.uninstall('acme:broken-cleanup')).toThrow('cleanup failed');
    expect(registry.hasExtension('acme:broken-cleanup')).toBe(false);
    expect(registry.getBlock(block.name)).toBeUndefined();
  });

  it('validates registered extension block and mark payloads', () => {
    const registry = createExtensionRegistry([{
      name: 'acme:validated',
      blocks: [{
        name: 'acme:property-card',
        validate: (node) => node.attrs?.kind === 'house',
      }],
      marks: [{
        name: 'acme:mention',
        validate: (value) => typeof value.attrs?.id === 'string',
      }],
    }]);

    expect(registry.validateBlock({
      type: 'extensionBlock',
      name: 'acme:property-card',
      attrs: { kind: 'house' },
    })).toBe(true);
    expect(registry.validateBlock({
      type: 'extensionBlock',
      name: 'acme:property-card',
      attrs: { kind: 'land' },
    })).toBe(false);
    expect(registry.validateMark({
      type: 'extensionMark',
      name: 'acme:mention',
      attrs: { id: 'u-1' },
    })).toBe(true);
    expect(registry.validateMark({ type: 'extensionMark', name: 'other:missing' })).toBe(false);
  });

  it('uninstalls only resources owned by the target extension', () => {
    const registry = createExtensionRegistry([
      { name: 'acme:one', blocks: [block] },
      { name: 'other:two', marks: [{ name: 'other:mark' }] },
    ]);
    expect(registry.uninstall('acme:one')).toBe(true);
    expect(registry.getBlock(block.name)).toBeUndefined();
    expect(registry.getMark('other:mark')).toBeDefined();
  });

  it('normalizes common key chords', () => {
    expect(normalizeKeyBinding('shift-mod-k')).toBe('Mod-Shift-K');
    expect(normalizeKeyBinding('ctrl-alt-enter')).toBe('Ctrl-Alt-enter');
    expect(() => normalizeKeyBinding('mod-shift')).toThrow();
  });

  it('routes registered DOM/HTML/Markdown hooks through one stable interface', () => {
    const render = vi.fn((node, { document }) => {
      const element = document.createElement('article');
      element.textContent = node.fallbackText ?? '';
      return element;
    });
    const registry = createExtensionRegistry([
      {
        name: 'acme:content',
        blocks: [{
          name: 'acme:property-card',
          renderDOM: render,
          toHTML: () => ({ tagName: 'article', attributes: { 'data-kind': 'property' } }),
          fromHTML: (element) => element.tagName === 'ARTICLE'
            ? { type: 'extensionBlock', name: 'acme:property-card', fallbackText: element.textContent ?? '' }
            : null,
          toMarkdown: (node) => `> ${node.fallbackText ?? ''}`,
        }],
        marks: [{
          name: 'acme:mention',
          toHTML: () => ({ tagName: 'span', attributes: { 'data-mention': 'true' } }),
          fromHTML: (element) => element.hasAttribute('data-mention')
            ? { type: 'extensionMark', name: 'acme:mention' }
            : null,
          toMarkdown: (_value, text) => `@{${text}}`,
        }],
      },
    ]);

    const node = { type: 'extensionBlock', name: 'acme:property-card', fallbackText: 'House' } as const;
    const markValue = { type: 'extensionMark', name: 'acme:mention' } as const;
    const owner = document.implementation.createHTMLDocument();

    expect(registry.renderBlock(node, { document: owner })?.textContent).toBe('House');
    expect(registry.serializeBlockHTML(node)).toEqual({ tagName: 'article', attributes: { 'data-kind': 'property' } });
    expect(registry.serializeBlockMarkdown(node)).toBe('> House');
    expect(registry.serializeMarkHTML(markValue)).toEqual({ tagName: 'span', attributes: { 'data-mention': 'true' } });
    expect(registry.serializeMarkMarkdown(markValue, 'Alice')).toBe('@{Alice}');
    expect(registry.parseBlockHTML(owner.createElement('article'))).toEqual({
      type: 'extensionBlock',
      name: 'acme:property-card',
      fallbackText: '',
    });
    const mention = owner.createElement('span');
    mention.dataset.mention = 'true';
    expect(registry.parseMarkHTML(mention)).toEqual({ type: 'extensionMark', name: 'acme:mention' });
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('rejects unsafe HTML descriptor tags/attributes before a host sees them', () => {
    const badTag = createExtensionRegistry([{ name: 'acme:one', blocks: [{
      name: 'acme:block',
      toHTML: () => ({ tagName: 'script' }),
    }] }]);
    expect(() => badTag.serializeBlockHTML({ type: 'extensionBlock', name: 'acme:block' })).toThrow(/Unsafe extension HTML tag/);

    const badAttribute = createExtensionRegistry([{ name: 'acme:two', marks: [{
      name: 'acme:mark',
      toHTML: () => ({ tagName: 'span', attributes: { onclick: 'boom()' } }),
    }] }]);
    expect(() => badAttribute.serializeMarkHTML({ type: 'extensionMark', name: 'acme:mark' })).toThrow(/Event-handler attributes/);
  });

  it('validates JSON-safe command arguments at runtime', async () => {
    const registry = createExtensionRegistry([{ name: 'acme:commands', commands: [{ name: 'acme:run', run: () => 'ok' }] }]);
    await expect(registry.runCommand('acme:run', {}, { ok: true })).resolves.toBe('ok');
    await expect(registry.runCommand('acme:run', {}, { bad: Number.NaN } as never)).rejects.toThrow(/JSON-safe/);
  });
});
