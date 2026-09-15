import { clipboardToDocument } from '@arichtext/clipboard';
import {
  createTextDocument,
  parseDocument,
  serializeDocument,
  toPlainText,
  type ARTDocument,
  type ARTHeadingNode,
  type ARTJSONValue,
  type ARTTextMark,
} from '@arichtext/core';
import {
  classifyBeforeInput,
  readDOMSelection,
  renderARTDocument,
  writeDOMSelection,
  type DOMExtensionRenderer,
} from '@arichtext/dom';
import {
  EditorEngine,
  createEditorState,
  getActiveBlock as queryActiveBlock,
  getActiveMarks as queryActiveMarks,
  isCollapsedSelection,
  transaction,
  type ActiveBlock,
  type ARTSelection,
  type ARTTextPoint,
  type EditorTransaction,
  type TransactionResult,
} from '@arichtext/engine';
import {
  deleteBackward,
  deleteForward,
  deleteSelection,
  insertFragment,
  insertParagraph,
  insertText,
  setCurrentHeading,
  setCurrentParagraph,
  toggleSelectionMark,
} from '@arichtext/engine/commands';
import {
  fromHTML,
  toHTML,
  type HTMLExtensionHooks,
} from '@arichtext/html';
import { fromMarkdown, toMarkdown } from '@arichtext/markdown';

export type ARichTextFormat = 'html' | 'json' | 'markdown' | 'text';
export type ARichTextReconcileSource = 'native-input' | 'composition';
export type ARichTextSimpleMark = 'bold' | 'italic' | 'underline' | 'strike';

export interface ARichTextExtensionKeyBinding {
  key: string;
  command: string;
  args?: ARTJSONValue;
}

/**
 * Structural extension runtime. `ExtensionRegistry` from
 * `@arichtext/extensions` satisfies this interface without creating a hard
 * runtime dependency from the base Web Component package.
 */
export interface ARichTextExtensionRuntime extends DOMExtensionRenderer, HTMLExtensionHooks {
  resolveKeyBinding?(key: string): ARichTextExtensionKeyBinding | undefined;
  runCommand?(name: string, host: unknown, args?: ARTJSONValue): Promise<unknown>;
}

export interface ARichTextTransactionDetail {
  result: TransactionResult;
}

export interface ARichTextSelectionChangeDetail {
  selection: ARTSelection | null;
}

export interface ARichTextReconcileDetail {
  source: ARichTextReconcileSource;
  document: ARTDocument;
}

export interface ARichTextFormatStateDetail {
  marks: ARTTextMark[];
}

export interface ARichTextErrorDetail {
  context: string;
  error: unknown;
}

const FORMATS: readonly ARichTextFormat[] = ['html', 'json', 'markdown', 'text'];
const HTMLElementBase: typeof HTMLElement = typeof HTMLElement === 'undefined'
  ? class {} as unknown as typeof HTMLElement
  : HTMLElement;

let cachedTemplate: HTMLTemplateElement | undefined;

function getTemplate(): HTMLTemplateElement {
  if (typeof document === 'undefined') {
    throw new Error('<a-rich-text> can only be instantiated in a browser DOM');
  }
  if (cachedTemplate) return cachedTemplate;

  const template = document.createElement('template');
  template.innerHTML = `
    <style>
      :host {
        --art-font-family: ui-sans-serif, system-ui, sans-serif;
        --art-font-size: 1rem;
        --art-line-height: 1.6;
        --art-color: CanvasText;
        --art-background: Canvas;
        --art-border-color: color-mix(in srgb, CanvasText 18%, transparent);
        --art-radius: 0.375rem;
        display: block;
        font-family: var(--art-font-family);
        color: var(--art-color);
      }

      [part='editor'] {
        min-height: 8rem;
        box-sizing: border-box;
        padding: 0.75rem;
        border: 1px solid var(--art-border-color);
        border-radius: var(--art-radius);
        background: var(--art-background);
        font-size: var(--art-font-size);
        line-height: var(--art-line-height);
        outline: none;
        overflow-wrap: anywhere;
      }

      [part='editor'] > :first-child { margin-top: 0; }
      [part='editor'] > :last-child { margin-bottom: 0; }

      [part='editor']:focus-visible {
        outline: 2px solid currentColor;
        outline-offset: 2px;
      }

      :host([disabled]) [part='editor'] {
        cursor: not-allowed;
        opacity: 0.6;
      }

      [part='editor'][data-empty='true']::before {
        content: attr(data-placeholder);
        opacity: 0.55;
        pointer-events: none;
      }
    </style>
    <div part="editor" role="textbox" aria-multiline="true"></div>
  `;
  cachedTemplate = template;
  return template;
}

export class ARichTextElement extends HTMLElementBase {
  static readonly formAssociated = true;
  static readonly observedAttributes = ['disabled', 'readonly', 'placeholder', 'value', 'format'];

  #internals: ElementInternals | null;
  #editor: HTMLDivElement;
  #engine: EditorEngine;
  #extensions?: ARichTextExtensionRuntime;
  #unsubscribeEngine?: () => void;
  #selectionDocument?: Document;
  #composing = false;
  #reconcileQueued = false;
  #storedMarks: ARTTextMark[] | null = null;

  constructor() {
    super();
    if (typeof document === 'undefined' || typeof this.attachShadow !== 'function') {
      throw new Error('<a-rich-text> can only be instantiated in a browser DOM');
    }

    const shadow = this.attachShadow({ mode: 'open' });
    shadow.append(getTemplate().content.cloneNode(true));
    this.#editor = shadow.querySelector<HTMLDivElement>('[part="editor"]')!;
    this.#internals = typeof this.attachInternals === 'function' ? this.attachInternals() : null;
    this.#engine = this.#createEngine(createTextDocument(''));
    this.#renderFromEngine();

    this.#editor.addEventListener('beforeinput', this.#handleBeforeInput);
    this.#editor.addEventListener('input', this.#handleNativeInput);
    this.#editor.addEventListener('compositionstart', this.#handleCompositionStart);
    this.#editor.addEventListener('compositionend', this.#handleCompositionEnd);
    this.#editor.addEventListener('keydown', this.#handleKeyDown);
    this.#editor.addEventListener('paste', this.#handlePaste);
    this.#editor.addEventListener('blur', () => {
      this.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  connectedCallback(): void {
    if (this.hasAttribute('value') && this.getText().length === 0) {
      this.value = this.getAttribute('value') ?? '';
    }
    this.#selectionDocument = this.ownerDocument;
    this.#selectionDocument.addEventListener('selectionchange', this.#handleDocumentSelectionChange);
    this.#syncState();
    this.#syncDerivedState();
    this.#syncFormValue();
  }

  disconnectedCallback(): void {
    this.#selectionDocument?.removeEventListener('selectionchange', this.#handleDocumentSelectionChange);
    this.#selectionDocument = undefined;
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (name === 'value' && oldValue !== newValue && this.isConnected && !this.#editor.matches(':focus')) {
      this.value = newValue ?? '';
      return;
    }
    this.#syncState();
    this.#syncDerivedState();
    this.#syncFormValue();
  }

  get extensions(): ARichTextExtensionRuntime | undefined {
    return this.#extensions;
  }

  set extensions(value: ARichTextExtensionRuntime | undefined) {
    if (this.#extensions === value) return;
    this.#extensions = value;
    this.#renderFromEngine();
    this.#syncFormValue();
  }

  get format(): ARichTextFormat {
    const value = this.getAttribute('format')?.toLowerCase();
    return FORMATS.includes(value as ARichTextFormat) ? value as ARichTextFormat : 'html';
  }

  set format(value: ARichTextFormat) {
    this.setAttribute('format', FORMATS.includes(value) ? value : 'html');
  }

  /** Serialized form value using the selected `format`. */
  get value(): string {
    switch (this.format) {
      case 'json':
        return this.serializeJSON();
      case 'markdown':
        return this.getMarkdown();
      case 'text':
        return this.getText();
      case 'html':
      default:
        return this.getHTML();
    }
  }

  set value(value: string) {
    switch (this.format) {
      case 'json':
        this.setJSON(value);
        break;
      case 'markdown':
        this.setMarkdown(value);
        break;
      case 'text':
        this.setText(value);
        break;
      case 'html':
      default:
        this.setHTML(value);
        break;
    }
  }

  get disabled(): boolean {
    return this.hasAttribute('disabled');
  }

  set disabled(value: boolean) {
    this.toggleAttribute('disabled', value);
  }

  get readOnly(): boolean {
    return this.hasAttribute('readonly');
  }

  set readOnly(value: boolean) {
    this.toggleAttribute('readonly', value);
  }

  get canUndo(): boolean {
    return this.#engine.canUndo;
  }

  get canRedo(): boolean {
    return this.#engine.canRedo;
  }

  override focus(options?: FocusOptions): void {
    this.#editor.focus(options);
    const selection = this.#engine.state.selection;
    if (selection) writeDOMSelection(this.#editor, selection);
  }

  clear(): void {
    this.setJSON(createTextDocument(''));
    this.#emitInput();
  }

  undo(): boolean {
    const result = this.#engine.undo();
    if (!result) return false;
    this.#emitTransactionResult(result);
    return true;
  }

  redo(): boolean {
    const result = this.#engine.redo();
    if (!result) return false;
    this.#emitTransactionResult(result);
    return true;
  }

  dispatch(transactionValue: EditorTransaction): TransactionResult {
    const result = this.#engine.dispatch(transactionValue);
    this.#emitTransactionResult(result);
    return result;
  }

  getSelection(): ARTSelection | null {
    const selection = this.#engine.state.selection;
    return selection ? cloneSelection(selection) : null;
  }

  getActiveMarks(): ARTTextMark[] {
    const selection = this.#engine.state.selection;
    if (this.#storedMarks && selection && isCollapsedSelection(selection)) {
      return this.#storedMarks.map(cloneMark);
    }
    return queryActiveMarks(this.#engine.state).map(cloneMark);
  }

  isMarkActive(mark: ARichTextSimpleMark | ARTTextMark['type']): boolean {
    return this.getActiveMarks().some((candidate) => candidate.type === mark);
  }

  getActiveBlock(): ActiveBlock | null {
    return queryActiveBlock(this.#engine.state);
  }

  toggleMark(mark: ARichTextSimpleMark | ARTTextMark): boolean {
    if (this.disabled || this.readOnly) return false;
    const normalized: ARTTextMark = typeof mark === 'string' ? { type: mark } : cloneMark(mark);
    const state = this.#engine.state;
    const selection = state.selection;
    if (!selection) return false;

    if (isCollapsedSelection(selection)) {
      this.#toggleStoredMark(normalized);
      this.#emitFormatState();
      return true;
    }

    const command = toggleSelectionMark(state, normalized);
    if (!command) return false;
    const result = this.#engine.dispatch(command);
    this.#emitTransactionResult(result);
    return true;
  }

  setParagraph(): boolean {
    if (this.disabled || this.readOnly) return false;
    const command = setCurrentParagraph(this.#engine.state);
    if (!command) return false;
    this.#emitTransactionResult(this.#engine.dispatch(command));
    return true;
  }

  setHeading(level: ARTHeadingNode['level']): boolean {
    if (this.disabled || this.readOnly) return false;
    const command = setCurrentHeading(this.#engine.state, level);
    if (!command) return false;
    this.#emitTransactionResult(this.#engine.dispatch(command));
    return true;
  }

  async runExtensionCommand(name: string, args?: ARTJSONValue): Promise<unknown> {
    if (!this.#extensions?.runCommand) throw new RangeError(`No extension command runtime is installed: ${name}`);
    return this.#extensions.runCommand(name, this, args);
  }

  getText(): string {
    return toPlainText(this.#engine.state.document);
  }

  setText(text: string): void {
    this.setJSON(createTextDocument(text));
  }

  getJSON(): ARTDocument {
    return this.#engine.state.document;
  }

  setJSON(document: ARTDocument | string): void {
    const parsed = typeof document === 'string' ? parseDocument(document) : document;
    this.#replaceEngine(parsed, null);
  }

  serializeJSON(): string {
    return serializeDocument(this.#engine.state.document);
  }

  getHTML(): string {
    return toHTML(this.#engine.state.document, this.#extensions ? { extensions: this.#extensions } : {});
  }

  setHTML(html: string): void {
    this.setJSON(fromHTML(html, this.#extensions ? { extensions: this.#extensions } : {}));
  }

  getMarkdown(): string {
    return toMarkdown(this.#engine.state.document);
  }

  setMarkdown(markdown: string): void {
    this.setJSON(fromMarkdown(markdown));
  }

  formResetCallback(): void {
    this.value = this.getAttribute('value') ?? '';
  }

  formDisabledCallback(disabled: boolean): void {
    this.disabled = disabled;
  }

  #createEngine(document: ARTDocument, selection: ARTSelection | null = null): EditorEngine {
    let state;
    try {
      state = createEditorState(document, selection);
    } catch (error) {
      if (selection) state = createEditorState(document, null);
      else throw error;
    }
    const engine = new EditorEngine(state);
    this.#unsubscribeEngine = engine.subscribe(this.#handleEngineResult);
    return engine;
  }

  #replaceEngine(document: ARTDocument, selection: ARTSelection | null): void {
    this.#unsubscribeEngine?.();
    this.#engine = this.#createEngine(document, selection);
    this.#storedMarks = null;
    this.#renderFromEngine();
    this.#syncDerivedState();
    this.#syncFormValue();
    this.#emitFormatState();
  }

  #handleEngineResult = (result: TransactionResult): void => {
    if (result.documentChanged) {
      this.#renderFromEngine();
      this.#syncDerivedState();
      this.#syncFormValue();
    }
  };

  #handleBeforeInput = (event: InputEvent): void => {
    if (this.disabled || this.readOnly) {
      event.preventDefault();
      return;
    }

    const intent = classifyBeforeInput(event);
    if (!intent.intercept) return;

    this.#syncSelectionFromDOM();
    const state = this.#engine.state;
    const selection = state.selection;

    if (intent.kind === 'historyUndo') {
      event.preventDefault();
      this.undo();
      return;
    }
    if (intent.kind === 'historyRedo') {
      event.preventDefault();
      this.redo();
      return;
    }

    if (!selection) return;

    if (intent.kind === 'toggleMark' && isCollapsedSelection(selection)) {
      event.preventDefault();
      this.#toggleStoredMark(intent.mark);
      this.#emitFormatState();
      return;
    }

    let command: EditorTransaction | null = null;
    switch (intent.kind) {
      case 'insertText':
      case 'insertLineBreak':
        command = insertText(state, intent.text, this.#storedMarks ?? undefined);
        break;
      case 'insertParagraph':
        command = insertParagraph(state);
        break;
      case 'deleteSelection':
        command = deleteSelection(state);
        break;
      case 'deleteBackward':
        command = deleteBackward(state);
        break;
      case 'deleteForward':
        command = deleteForward(state);
        break;
      case 'toggleMark':
        command = toggleSelectionMark(state, intent.mark);
        break;
    }

    if (!command) return;
    event.preventDefault();
    const result = this.#engine.dispatch(command);
    this.#emitTransactionResult(result);
  };

  #handleKeyDown = (event: KeyboardEvent): void => {
    if (this.disabled || this.readOnly || this.#composing || event.altKey) return;

    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    let handled = false;

    if (mod && key === 'b') handled = this.toggleMark('bold');
    else if (mod && key === 'i') handled = this.toggleMark('italic');
    else if (mod && key === 'u') handled = this.toggleMark('underline');
    else if (mod && key === 'z' && event.shiftKey) handled = this.redo();
    else if (mod && key === 'z') handled = this.undo();
    else if (event.ctrlKey && key === 'y') handled = this.redo();

    if (handled) {
      event.preventDefault();
      return;
    }

    if (!this.#extensions?.resolveKeyBinding || !this.#extensions.runCommand) return;
    if (!event.ctrlKey && !event.metaKey && !event.altKey) return;
    const binding = this.#extensions.resolveKeyBinding(keyboardChord(event));
    if (!binding) return;
    event.preventDefault();
    void this.#extensions.runCommand(binding.command, this, binding.args).catch((error) => {
      this.#emitError('extension-command', error);
    });
  };

  #handlePaste = (event: ClipboardEvent): void => {
    if (this.disabled || this.readOnly) {
      event.preventDefault();
      return;
    }

    event.preventDefault();
    const data = event.clipboardData;
    if (!data) {
      this.#emitError('paste-unsupported-payload', new TypeError('Clipboard data is unavailable'));
      return;
    }

    const parsed = clipboardToDocument(data);
    if (!parsed) {
      this.#emitError('paste-unsupported-payload', new TypeError('Clipboard does not contain supported text content'));
      return;
    }

    this.#syncSelectionFromDOM();
    const command = insertFragment(this.#engine.state, parsed.document.content);
    if (!command) {
      this.#emitError('paste-unsupported-selection', new RangeError('Paste currently requires a selection within one text block'));
      return;
    }

    const result = this.#engine.dispatch(command);
    this.#emitTransactionResult(result);
  };

  #handleNativeInput = (): void => {
    if (this.#composing || this.#reconcileQueued) return;
    this.#reconcileNativeDOM('native-input');
  };

  #handleCompositionStart = (): void => {
    this.#composing = true;
  };

  #handleCompositionEnd = (): void => {
    this.#composing = false;
    if (this.#reconcileQueued) return;
    this.#reconcileQueued = true;
    queueMicrotask(() => {
      this.#reconcileQueued = false;
      if (!this.#composing && this.isConnected) this.#reconcileNativeDOM('composition');
    });
  };

  #handleDocumentSelectionChange = (): void => {
    if (!this.isConnected || this.#composing) return;
    this.#storedMarks = null;
    this.#syncSelectionFromDOM();
    this.#emitFormatState();
  };

  #syncSelectionFromDOM(): void {
    const selection = readDOMSelection(this.#editor);
    if (!selection) return;
    const result = this.#engine.dispatch(transaction().setSelection(selection));
    if (result.selectionChanged) {
      this.dispatchEvent(new CustomEvent<ARichTextSelectionChangeDetail>('selection-change', {
        detail: { selection: result.state.selection ? cloneSelection(result.state.selection) : null },
        bubbles: true,
        composed: true,
      }));
    }
  }

  #reconcileNativeDOM(source: ARichTextReconcileSource): void {
    try {
      const selection = readDOMSelection(this.#editor);
      const document = fromHTML(
        this.#editor.innerHTML,
        this.#extensions ? { extensions: this.#extensions } : {},
      );
      this.#replaceEngine(document, selection);
      this.dispatchEvent(new CustomEvent<ARichTextReconcileDetail>('reconcile', {
        detail: { source, document: this.getJSON() },
        bubbles: true,
        composed: true,
      }));
    } catch (error) {
      this.#emitError('native-reconcile', error);
      this.#renderFromEngine();
    }
  }

  #renderFromEngine(): void {
    const state = this.#engine.state;
    renderARTDocument(
      this.#editor,
      state.document,
      this.#extensions ? { extensions: this.#extensions } : {},
    );
    if (state.selection && this.shadowRoot?.activeElement === this.#editor) {
      writeDOMSelection(this.#editor, state.selection);
    }
  }

  #toggleStoredMark(mark: ARTTextMark): void {
    const state = this.#engine.state;
    const point = state.selection?.anchor;
    const marks = this.#storedMarks ?? (point ? marksAtARTPoint(state.document, point) : []);
    const exists = marks.some((candidate) => sameMarkIdentity(candidate, mark));
    this.#storedMarks = exists
      ? marks.filter((candidate) => !sameMarkIdentity(candidate, mark))
      : [...marks.filter((candidate) => !sameMarkIdentity(candidate, mark)), cloneMark(mark)];
  }

  #emitTransactionResult(result: TransactionResult): void {
    this.dispatchEvent(new CustomEvent<ARichTextTransactionDetail>('transaction', {
      detail: { result },
      bubbles: true,
      composed: true,
    }));
    if (result.selectionChanged) {
      this.dispatchEvent(new CustomEvent<ARichTextSelectionChangeDetail>('selection-change', {
        detail: { selection: result.state.selection ? cloneSelection(result.state.selection) : null },
        bubbles: true,
        composed: true,
      }));
    }
    this.#emitFormatState();
    if (result.documentChanged) this.#emitInput();
  }

  #emitFormatState(): void {
    this.dispatchEvent(new CustomEvent<ARichTextFormatStateDetail>('format-state-change', {
      detail: { marks: this.getActiveMarks() },
      bubbles: true,
      composed: true,
    }));
  }

  #emitInput(): void {
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  }

  #emitError(context: string, error: unknown): void {
    this.dispatchEvent(new CustomEvent<ARichTextErrorDetail>('error', {
      detail: { context, error },
      bubbles: true,
      composed: true,
    }));
  }

  #syncState(): void {
    const editable = !this.disabled && !this.readOnly;
    this.#editor.contentEditable = editable ? 'true' : 'false';
    this.#editor.setAttribute('aria-disabled', String(this.disabled));
    this.#editor.setAttribute('aria-readonly', String(this.readOnly));
    this.#editor.dataset.placeholder = this.getAttribute('placeholder') ?? '';
  }

  #syncDerivedState(): void {
    this.#editor.dataset.empty = String(this.getText().length === 0);
  }

  #syncFormValue(): void {
    this.#internals?.setFormValue(this.value);
  }
}

function marksAtARTPoint(document: ARTDocument, point: ARTTextPoint): ARTTextMark[] {
  let current: unknown = document;
  for (const index of point.blockPath) {
    if (!current || typeof current !== 'object') return [];
    const content = (current as { content?: unknown }).content;
    if (!Array.isArray(content) || index < 0 || index >= content.length) return [];
    current = content[index];
  }

  if (!current || typeof current !== 'object') return [];
  const block = current as { type?: unknown; content?: unknown };
  if ((block.type !== 'paragraph' && block.type !== 'heading') || !Array.isArray(block.content)) return [];

  let cursor = 0;
  for (const candidate of block.content) {
    if (!candidate || typeof candidate !== 'object') continue;
    const node = candidate as { type?: unknown; text?: unknown; marks?: unknown };
    if (node.type !== 'text' || typeof node.text !== 'string') continue;
    const end = cursor + node.text.length;
    if ((point.offset >= cursor && point.offset < end) || (point.offset === end && end > 0)) {
      return Array.isArray(node.marks)
        ? (node.marks as ARTTextMark[]).map(cloneMark)
        : [];
    }
    cursor = end;
  }
  return [];
}

function cloneMark(mark: ARTTextMark): ARTTextMark {
  if (mark.type === 'link') return { type: 'link', href: mark.href };
  if (mark.type === 'extensionMark') {
    return {
      type: 'extensionMark',
      name: mark.name,
      ...(mark.attrs ? { attrs: cloneJSON(mark.attrs) } : {}),
    };
  }
  return { type: mark.type };
}

function sameMarkIdentity(left: ARTTextMark, right: ARTTextMark): boolean {
  if (left.type !== right.type) return false;
  if (left.type === 'extensionMark') return right.type === 'extensionMark' && left.name === right.name;
  return true;
}

function cloneSelection(selection: ARTSelection): ARTSelection {
  return {
    anchor: { blockPath: [...selection.anchor.blockPath], offset: selection.anchor.offset },
    head: { blockPath: [...selection.head.blockPath], offset: selection.head.offset },
  };
}

function cloneJSON<T>(value: T): T {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value)) as T;
}

function keyboardChord(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push('Mod');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  parts.push(key);
  return parts.join('-');
}

export function defineARichText(tagName = 'a-rich-text'): void {
  if (typeof customElements === 'undefined') return;
  if (!customElements.get(tagName)) customElements.define(tagName, ARichTextElement);
}

defineARichText();
