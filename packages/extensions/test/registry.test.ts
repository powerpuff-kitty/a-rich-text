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
});
