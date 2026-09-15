import type { ARichTextExtension, ExtensionPreset } from './types.js';

export const coreCapability: ARichTextExtension = {
  name: 'arichtext:core',
  metadata: { capability: 'core-document' },
};

export const formattingCapability: ARichTextExtension = {
  name: 'arichtext:formatting',
  metadata: { capability: 'formatting' },
};

export const linksCapability: ARichTextExtension = {
  name: 'arichtext:links',
  metadata: { capability: 'links' },
};

export const listsCapability: ARichTextExtension = {
  name: 'arichtext:lists',
  metadata: { capability: 'lists' },
};

export const blocksCapability: ARichTextExtension = {
  name: 'arichtext:blocks',
  metadata: { capability: 'blocks' },
};

export const tablesCapability: ARichTextExtension = {
  name: 'arichtext:tables',
  metadata: { capability: 'tables' },
};

export const mediaCapability: ARichTextExtension = {
  name: 'arichtext:media',
  metadata: { capability: 'media' },
};

export const historyCapability: ARichTextExtension = {
  name: 'arichtext:history',
  metadata: { capability: 'history' },
};

export const documentUXCapability: ARichTextExtension = {
  name: 'arichtext:document-ux',
  metadata: { capability: 'document-ux' },
};

export const headlessPreset: ExtensionPreset = {
  name: 'headless',
  extensions: [coreCapability],
};

export const minimalPreset: ExtensionPreset = {
  name: 'minimal',
  extensions: [coreCapability, formattingCapability, linksCapability, historyCapability],
};

export const standardPreset: ExtensionPreset = {
  name: 'standard',
  extensions: [
    coreCapability,
    formattingCapability,
    linksCapability,
    listsCapability,
    blocksCapability,
    mediaCapability,
    historyCapability,
  ],
};

export const documentPreset: ExtensionPreset = {
  name: 'document',
  extensions: [
    ...standardPreset.extensions,
    tablesCapability,
    documentUXCapability,
  ],
};

export function extendPreset<TContext = unknown>(
  preset: ExtensionPreset<TContext>,
  ...extensions: readonly ARichTextExtension<TContext>[]
): ExtensionPreset<TContext> {
  const byName = new Map<string, ARichTextExtension<TContext>>();
  for (const extension of [...preset.extensions, ...extensions]) byName.set(extension.name, extension);
  return { name: preset.name, extensions: [...byName.values()] };
}

export function createPreset<TContext = unknown>(
  name: string,
  extensions: readonly ARichTextExtension<TContext>[],
): ExtensionPreset<TContext> {
  return { name, extensions: [...extensions] };
}
