import { isExtensionName } from '@arichtext/core';
import type { ARTExtensionBlockNode, ARTExtensionMark, ARTJSONValue } from '@arichtext/core';
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

  getBlock(name: string): ExtensionBlockDefinition | undefined { return this.#blocks.get(name); }
  getMark(name: string): ExtensionMarkDefinition | undefined { return this.#marks.get(name); }
  getCommand(name: string): ExtensionCommandDefinition<TContext> | undefined { return this.#commands.get(name); }
  getKeyBinding(key: string): ExtensionKeyBinding | undefined { return this.#keybindings.get(normalizeKeyBinding(key)); }

  validateBlock(node: ARTExtensionBlockNode): boolean {
    const definition = this.#blocks.get(node.name);
    return Boolean(definition && (definition.validate?.(node) ?? true));
  }

  validateMark(mark: ARTExtensionMark): boolean {
    const definition = this.#marks.get(mark.name);
    return Boolean(definition && (definition.validate?.(mark) ?? true));
  }

  install(extension: ARichTextExtension<TContext>): () => void {
    validateExtension(extension);
    if (this.hasExtension(extension.name)) throw new ExtensionConflictError(`Extension already installed: ${extension.name}`);

    const blocks = [...(extension.blocks ?? [])];
    const marks = [...(extension.marks ?? [])];
    const commands = [...(extension.commands ?? [])];
    const keys = [...(extension.keybindings ?? [])];
    this.#assertAvailable(extension, blocks, marks, commands, keys);

    this.#extensions.push(extension);
    for (const item of blocks) this.#blocks.set(item.name, item);
    for (const item of marks) this.#marks.set(item.name, item);
    for (const item of commands) this.#commands.set(item.name, item);
    for (const item of keys) this.#keybindings.set(normalizeKeyBinding(item.key), item);

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
      this.#uninstallExtension(extension);
    };
  }

  uninstall(name: string): boolean {
    const extension = this.#extensions.find((candidate) => candidate.name === name);
    if (!extension) return false;
    this.#uninstallExtension(extension);
    return true;
  }

  async runCommand(name: string, host: TContext, args?: ARTJSONValue): Promise<unknown> {
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

  #uninstallExtension(extension: ARichTextExtension<TContext>): void {
    let hookError: unknown;
    try {
      extension.onUninstall?.(this);
    } catch (error) {
      hookError = error;
    } finally {
      this.#removeOwned(extension);
    }
    if (hookError !== undefined) throw hookError;
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

    for (const item of blocks) {
      validateNamespaced(item.name, 'block');
      if (seenBlocks.has(item.name) || this.#blocks.has(item.name)) throw new ExtensionConflictError(`Block name conflict: ${item.name}`);
      seenBlocks.add(item.name);
    }
    for (const item of marks) {
      validateNamespaced(item.name, 'mark');
      if (seenMarks.has(item.name) || this.#marks.has(item.name)) throw new ExtensionConflictError(`Mark name conflict: ${item.name}`);
      seenMarks.add(item.name);
    }
    for (const item of commands) {
      validateNamespaced(item.name, 'command');
      if (seenCommands.has(item.name) || this.#commands.has(item.name)) throw new ExtensionConflictError(`Command name conflict: ${item.name}`);
      seenCommands.add(item.name);
    }
    for (const item of keys) {
      if (!item.command || (!seenCommands.has(item.command) && !this.#commands.has(item.command))) {
        throw new TypeError(`Key binding ${item.key} references unknown command ${item.command} in ${extension.name}`);
      }
      const key = normalizeKeyBinding(item.key);
      if (seenKeys.has(key) || this.#keybindings.has(key)) throw new ExtensionConflictError(`Key binding conflict: ${key}`);
      seenKeys.add(key);
    }
  }

  #removeOwned(extension: ARichTextExtension<TContext>): void {
    this.#extensions = this.#extensions.filter((candidate) => candidate !== extension);
    for (const item of extension.blocks ?? []) if (this.#blocks.get(item.name) === item) this.#blocks.delete(item.name);
    for (const item of extension.marks ?? []) if (this.#marks.get(item.name) === item) this.#marks.delete(item.name);
    for (const item of extension.commands ?? []) if (this.#commands.get(item.name) === item) this.#commands.delete(item.name);
    for (const item of extension.keybindings ?? []) {
      const key = normalizeKeyBinding(item.key);
      if (this.#keybindings.get(key) === item) this.#keybindings.delete(key);
    }
  }
}

export function createExtensionRegistry<TContext = unknown>(extensions: readonly ARichTextExtension<TContext>[] = []): ExtensionRegistry<TContext> {
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
  return ['Mod', 'Ctrl', 'Meta', 'Alt', 'Shift'].filter((modifier) => modifiers.has(modifier)).concat(key).join('-');
}

function validateExtension<TContext>(extension: ARichTextExtension<TContext>): void {
  if (!extension || typeof extension !== 'object') throw new TypeError('Extension must be an object');
  validateNamespaced(extension.name, 'extension');
}

function validateNamespaced(name: string, kind: string): void {
  if (!isExtensionName(name)) throw new TypeError(`${kind} name must be namespaced lowercase identifier (namespace:name): ${name}`);
}
