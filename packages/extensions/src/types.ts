import type {
  ARTExtensionBlockNode,
  ARTExtensionMark,
  ARTJSONValue,
  ARTJSONObject,
} from '@arichtext/core';

export interface ExtensionHTMLDescriptor {
  /** Safe tag name selected by the extension. Hosts must still validate it. */
  tagName: string;
  attributes?: Readonly<Record<string, string>>;
  textContent?: string;
}

export interface ExtensionDOMRenderContext {
  document: Document;
}

export interface ExtensionBlockDefinition {
  name: string;
  validate?: (node: ARTExtensionBlockNode) => boolean;
  renderDOM?: (node: ARTExtensionBlockNode, context: ExtensionDOMRenderContext) => Node;
  toHTML?: (node: ARTExtensionBlockNode) => ExtensionHTMLDescriptor;
  toMarkdown?: (node: ARTExtensionBlockNode) => string;
}

export interface ExtensionMarkDefinition {
  name: string;
  validate?: (mark: ARTExtensionMark) => boolean;
  renderDOM?: (mark: ARTExtensionMark, context: ExtensionDOMRenderContext) => HTMLElement;
  toHTML?: (mark: ARTExtensionMark) => ExtensionHTMLDescriptor;
  toMarkdown?: (mark: ARTExtensionMark, text: string) => string;
}

export interface ExtensionCommandContext<TContext = unknown> {
  host: TContext;
  extension: ARichTextExtension<TContext>;
}

export interface ExtensionCommandDefinition<TContext = unknown> {
  name: string;
  run: (
    context: ExtensionCommandContext<TContext>,
    args?: ARTJSONValue,
  ) => unknown | Promise<unknown>;
}

export interface ExtensionKeyBinding {
  /** Normalized key chord, for example `Mod-Shift-K`. */
  key: string;
  command: string;
  args?: ARTJSONValue;
}

export interface ARichTextExtension<TContext = unknown> {
  /** Namespaced extension identifier, for example `acme:properties`. */
  name: string;
  version?: string;
  /** Optional opaque, JSON-safe metadata useful to tooling/docs. */
  metadata?: ARTJSONObject;
  blocks?: readonly ExtensionBlockDefinition[];
  marks?: readonly ExtensionMarkDefinition[];
  commands?: readonly ExtensionCommandDefinition<TContext>[];
  keybindings?: readonly ExtensionKeyBinding[];
  onInstall?: (registry: ExtensionRegistryView<TContext>) => void;
  onUninstall?: (registry: ExtensionRegistryView<TContext>) => void;
}

export interface ExtensionRegistryView<TContext = unknown> {
  readonly extensions: readonly ARichTextExtension<TContext>[];
  hasExtension(name: string): boolean;
  getBlock(name: string): ExtensionBlockDefinition | undefined;
  getMark(name: string): ExtensionMarkDefinition | undefined;
  getCommand(name: string): ExtensionCommandDefinition<TContext> | undefined;
  getKeyBinding(key: string): ExtensionKeyBinding | undefined;
}

export interface ExtensionPreset<TContext = unknown> {
  readonly name: 'headless' | 'minimal' | 'standard' | 'document' | string;
  readonly extensions: readonly ARichTextExtension<TContext>[];
}
