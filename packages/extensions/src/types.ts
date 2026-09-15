import type {
  ARTExtensionBlockNode,
  ARTExtensionMark,
  ARTJSONValue,
  ARTJSONObject,
} from '@arichtext/core';

/** Safe HTML description; extension hooks never return raw HTML strings. */
export interface ExtensionHTMLDescriptor {
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
  /** Trusted installed extension code. Document payloads themselves never contain executable renderers. */
  renderDOM?: (node: ARTExtensionBlockNode, context: ExtensionDOMRenderContext) => Node;
  /** Produce a safe descriptor rather than raw HTML. */
  toHTML?: (node: ARTExtensionBlockNode) => ExtensionHTMLDescriptor;
  /** Recognize external/semantic HTML and convert it into the portable ART envelope. */
  fromHTML?: (element: Element) => ARTExtensionBlockNode | null;
  /** Markdown is allowed to be lossy; return a portable representation or fallback string. */
  toMarkdown?: (node: ARTExtensionBlockNode) => string;
}

export interface ExtensionMarkDefinition {
  name: string;
  validate?: (mark: ARTExtensionMark) => boolean;
  renderDOM?: (mark: ARTExtensionMark, context: ExtensionDOMRenderContext) => HTMLElement;
  toHTML?: (mark: ARTExtensionMark) => ExtensionHTMLDescriptor;
  fromHTML?: (element: Element) => ARTExtensionMark | null;
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

/**
 * Structural host interface intentionally lives in this lightweight package.
 * DOM/HTML/Markdown hosts can accept this interface without importing a
 * concrete registry implementation.
 */
export interface ExtensionRegistryView<TContext = unknown> {
  readonly extensions: readonly ARichTextExtension<TContext>[];
  hasExtension(name: string): boolean;
  getBlock(name: string): ExtensionBlockDefinition | undefined;
  getMark(name: string): ExtensionMarkDefinition | undefined;
  getCommand(name: string): ExtensionCommandDefinition<TContext> | undefined;
  getKeyBinding(key: string): ExtensionKeyBinding | undefined;
  validateBlock(node: ARTExtensionBlockNode): boolean;
  validateMark(mark: ARTExtensionMark): boolean;

  renderBlock(node: ARTExtensionBlockNode, context: ExtensionDOMRenderContext): Node | undefined;
  renderMark(mark: ARTExtensionMark, context: ExtensionDOMRenderContext): HTMLElement | undefined;
  serializeBlockHTML(node: ARTExtensionBlockNode): ExtensionHTMLDescriptor | undefined;
  serializeMarkHTML(mark: ARTExtensionMark): ExtensionHTMLDescriptor | undefined;
  parseBlockHTML(element: Element): ARTExtensionBlockNode | undefined;
  parseMarkHTML(element: Element): ARTExtensionMark | undefined;
  serializeBlockMarkdown(node: ARTExtensionBlockNode): string | undefined;
  serializeMarkMarkdown(mark: ARTExtensionMark, text: string): string | undefined;
}

export interface ExtensionPreset<TContext = unknown> {
  readonly name: 'headless' | 'minimal' | 'standard' | 'document' | string;
  readonly extensions: readonly ARichTextExtension<TContext>[];
}
