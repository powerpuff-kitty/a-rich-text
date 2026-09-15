import { isExtensionName } from '@arichtext/core';
import type {
  ARichTextExtension,
  ExtensionBlockDefinition,
  ExtensionCommandDefinition,
  ExtensionKeyBinding,
  ExtensionMarkDefinition,
  ExtensionRegistryView,
} from './types.js';

export class ExtensionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExtensionConflictError';
  }
}

export class ExtensionRegistry<TContext = unknown> implements ExtensionRegistryView<TContext> {
  #extensions: ARichTextExtension<TContext>[] = [];
  #blocks = new Map<string, ExtensionBlockDefinition>();
  #marks = new Map<string, ExtensionMarkDefinition>();
  #commands = new Map<string, ExtensionCommandDefinition<TContext>>();
  #keybindings = new Map<string, ExtensionKeyBinding>();

  constructor(extensions: readonly ARichTextExtension<TContext>[] = []) {
    for (const extension of extensions) this.install(extension);
  }

  get extensions(): readonly ARichTextExtension<TContext>[] {
    return [...this.#extensions];
  }

  hasExtension(name: string): boolean {
    return this.#extensions.some((extension) => extension.name === name);
  }

  getBlock(name: string): ExtensionBlockDefinition | undefined {
    return this.#blocks.get(name);
  }

  getMark(name: string): ExtensionMarkDefinition | undefined {
    return this.#marks.get(name);
  }

  getCommand(name: string): ExtensionCommandDefinition<TContext> | undefined {
    return this.#commands.get(name);
  }

  getKeyBinding(key: string): ExtensionKeyBinding | undefined {
    return this.#keybindings.get(normalizeKeyBinding(key));
  }

  install(extension: ARichTextExtension<TContext>): () => void {
    validateExtension(extension);
    if (this.hasExtension(extension.name)) {
      throw new ExtensionConflictError(`Extension already installed: ${extension.name}`);
    }

    const ownedBlocks = [...(extension.blocks ?? [])];
    const ownedMarks = [...(extension.marks ?? [])];
    const ownedCommands = [...(extension.commands ?? [])];
    const ownedKeys = [...(extension.keybindings ?? [])];

    this.#assertAvailable(extension, ownedBlocks, ownedMarks, ownedCommands, ownedKeys);

    this.#extensions.push(extension);
    for (const block of ownedBlocks) this.#blocks.set(block.name, block);
    for (const mark of ownedMarks) this.#marks.set(mark.name, mark);
    for (const command of ownedCommands) this.#commands.set(command.name, command);
    for (const binding of ownedKeys) this.#keybindings.set(normalizeKeyBinding(binding.key), binding);

    try {
      extension.onInstall?.(this);
    } catch (error) {
      this.#removeOwned(extension);
      throw error;
    }

    let active = true;
    return () => {
      if (!active) return;
      active = false;
      extension.onUninstall?.(this);
      this.#removeOwned(extension);
    };
  }

  uninstall(name: string): boolean {
    const extension = this.#extensions.find((candidate) => candidate.name === name);
    if (!extension) return false;
    extension.onUninstall?.(this);
    this.#removeOwned(extension);
    return true;
  }

  async runCommand(name: string, host: TContext, args?: import('@arichtext/core').ARTJSONValue): Promise<unknown> {
    const command = this.#commands.get(name);
    if (!command) throw new RangeError(`Unknown extension command: ${name}`);
    const extension = this.#extensions.find((candidate) => candidate.commands?.includes(command));
    if (!extension) throw new Error(`Extension ownership missing for command: ${name}`);
    return command.run({ host, extension }, args);
  }

  resolveKeyBinding(key: string): ExtensionKeyBinding | undefined {
    const binding = this.getKeyBinding(key);
    return binding ? { ...binding } : undefined;
  }

  #assertAvailable(
    extension: ARichTextExtension<TContext>,
    blocks: readonly ExtensionBlockDefinition[],
    marks: readonly ExtensionMarkDefinition[],
    commands: readonly ExtensionCommandDefinition<TContext>[],
    keys: readonly ExtensionKeyBinding[],
  ): void {
    const seenBlocks = new Set<string>();
    const seenMarks = new Set<string>();
    const seenCommands = new Set<string>();
    const seenKeys = new Set<string>();

    for (const block of blocks) {
      validateNamespaced(block.name, 'block');
      if (seenBlocks.has(block.name) || this.#blocks.has(block.name)) {
        throw new ExtensionConflictError(`Block name conflict: ${block.name}`);
      }
      seenBlocks.add(block.name);
    }

    for (const mark of marks) {
      validateNamespaced(mark.name, 'mark');
      if (seenMarks.has(mark.name) || this.#marks.has(mark.name)) {
        throw new ExtensionConflictError(`Mark name conflict: ${mark.name}`);
      }
      seenMarks.add(mark.name);
    }

    for (const command of commands) {
      validateNamespaced(command.name, 'command');
      if (seenCommands.has(command.name) || this.#commands.has(command.name)) {
        throw new ExtensionConflictError(`Command name conflict: ${command.name}`);
      }
      seenCommands.add(command.name);
    }

    for (const binding of keys) {
      if (!binding.command || (!seenCommands.has(binding.command) && !this.#commands.has(binding.command))) {
        throw new TypeError(`Key binding ${binding.key} references unknown command ${binding.command} in ${extension.name}`);
      }
      const key = normalizeKeyBinding(binding.key);
      if (seenKeys.has(key) || this.#keybindings.has(key)) {
        throw new ExtensionConflictError(`Key binding conflict: ${key}`);
      }
      seenKeys.add(key);
    }
  }

  #removeOwned(extension: ARichTextExtension<TContext>): void {
    this.#extensions = this.#extensions.filter((candidate) => candidate !== extension);
    for (const block of extension.blocks ?? []) if (this.#blocks.get(block.name) === block) this.#blocks.delete(block.name);
    for (const mark of extension.marks ?? []) if (this.#marks.get(mark.name) === mark) this.#marks.delete(mark.name);
    for (const command of extension.commands ?? []) if (this.#commands.get(command.name) === command) this.#commands.delete(command.name);
    for (const binding of extension.keybindings ?? []) {
      const key = normalizeKeyBinding(binding.key);
      if (this.#keybindings.get(key) === binding) this.#keybindings.delete(key);
    }
  }
}

export function createExtensionRegistry<TContext = unknown>(
  extensions: readonly ARichTextExtension<TContext>[] = [],
): ExtensionRegistry<TContext> {
  return new ExtensionRegistry(extensions);
}

export function normalizeKeyBinding(value: string): string {
  const parts = value.split('-').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) throw new TypeError('Key binding cannot be empty');
  const modifiers = new Set<string>();
  let key = '';
  for (const part of parts) {
    const normalized = part.toLowerCase();
    if (normalized === 'mod') modifiers.add('Mod');
    else if (normalized === 'shift') modifiers.add('Shift');
    else if (normalized === 'alt') modifiers.add('Alt');
    else if (normalized === 'ctrl' || normalized === 'control') modifiers.add('Ctrl');
    else if (normalized === 'meta' || normalized === 'cmd' || normalized === 'command') modifiers.add('Meta');
    else {
      if (key) throw new TypeError(`Key binding has multiple primary keys: ${value}`);
      key = part.length === 1 ? part.toUpperCase() : part;
    }
  }
  if (!key) throw new TypeError(`Key binding has no primary key: ${value}`);
  const order = ['Mod', 'Ctrl', 'Meta', 'Alt', 'Shift'];
  return [...order.filter((modifier) => modifiers.has(modifier)), key].join('-');
}

function validateExtension<TContext>(extension: ARichTextExtension<TContext>): void {
  if (!extension || typeof extension !== 'object') throw new TypeError('Extension must be an object');
  validateNamespaced(extension.name, 'extension');
}

function validateNamespaced(name: string, kind: string): void {
  if (!isExtensionName(name)) {
    throw new TypeError(`${kind} name must be namespaced lowercase identifier (namespace:name): ${name}`);
  }
}
