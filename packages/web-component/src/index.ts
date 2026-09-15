import {
  createTextDocument,
  parseDocument,
  serializeDocument,
  toPlainText,
  type ARTDocument,
  type ARTTextMark,
} from '@arichtext/core';
import {
  classifyBeforeInput,
  readDOMSelection,
  renderARTDocument,
  writeDOMSelection,
} from '@arichtext/dom';
import {
  EditorEngine,
  createEditorState,
  isCollapsedSelection,
  transaction,
  type ARTSelection,
  type ARTTextPoint,
  type EditorTransaction,
  type TransactionResult,
} from '@arichtext/engine';
import {
  deleteSelection,
  insertText,
  toggleSelectionMark,
} from '@arichtext/engine/commands';
import { fromHTML, toHTML } from '@arichtext/html';
import { fromMarkdown, toMarkdown } from '@arichtext/markdown';

export type ARichTextFormat = 'html' | 'json' | 'markdown' | 'text';
export type ARichTextReconcileSource = 'native-input' | 'composition';

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

  override focus(options?: FocusOptions): void {
    this.#editor.focus(options);
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
    return toHTML(this.#engine.state.document);
  }

  setHTML(html: string): void {
    this.setJSON(fromHTML(html));
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
      return;
    }

    let command: EditorTransaction | null = null;
    switch (intent.kind) {
      case 'insertText':
      case 'insertLineBreak':
        command = insertText(state, intent.text, this.#storedMarks ?? undefined);
        break;
      case 'deleteSelection':
        command = deleteSelection(state);
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
  };

  #syncSelectionFromDOM(): void {
    const selection = readDOMSelection(this.#editor);
    if (!selection) return;
    const result = this.#engine.dispatch(transaction().setSelection(selection));
    if (result.selectionChanged) {
      this.dispatchEvent(new CustomEvent<ARichTextSelectionChangeDetail>('selection-change', {
        detail: { selection: result.state.selection },
        bubbles: true,
        composed: true,
      }));
    }
  }

  #reconcileNativeDOM(source: ARichTextReconcileSource): void {
    try {
      const selection = readDOMSelection(this.#editor);
      const document = fromHTML(this.#editor.innerHTML);
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
    renderARTDocument(this.#editor, state.document);
    if (state.selection && this.shadowRoot?.activeElement === this.#editor) {
      writeDOMSelection(this.#editor, state.selection);
    }
  }

  #toggleStoredMark(mark: ARTTextMark): void {
    const state = this.#engine.state;
    const point = state.selection?.anchor;
    const marks = this.#storedMarks ?? (point ? marksAtARTPoint(state.document, point) : []);
    const existing = marks.some((candidate) => candidate.type === mark.type);
    this.#storedMarks = existing
      ? marks.filter((candidate) => candidate.type !== mark.type)
      : [...marks.filter((candidate) => candidate.type !== mark.type), cloneMark(mark)];
  }

  #emitTransactionResult(result: TransactionResult): void {
    this.dispatchEvent(new CustomEvent<ARichTextTransactionDetail>('transaction', {
      detail: { result },
      bubbles: true,
      composed: true,
    }));
    if (result.selectionChanged) {
      this.dispatchEvent(new CustomEvent<ARichTextSelectionChangeDetail>('selection-change', {
        detail: { selection: result.state.selection },
        bubbles: true,
        composed: true,
      }));
    }
    if (result.documentChanged) this.#emitInput();
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
  return mark.type === 'link' ? { type: 'link', href: mark.href } : { type: mark.type };
}

export function defineARichText(tagName = 'a-rich-text'): void {
  if (typeof customElements === 'undefined') return;
  if (!customElements.get(tagName)) customElements.define(tagName, ARichTextElement);
}

defineARichText();
