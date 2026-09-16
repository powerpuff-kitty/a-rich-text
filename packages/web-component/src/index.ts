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
  clearSelectionFormatting,
  toggleBlockquote,
  insertHorizontalRule,
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
import { EDITOR_TOOLS, EDITOR_VIEWS, tokens, type ARichTextTool, type ARichTextView } from './configuration.js';
export { EDITOR_TOOLS, EDITOR_VIEWS, type ARichTextTool, type ARichTextView } from './configuration.js';

export type ARichTextFormat = 'html' | 'json' | 'markdown' | 'text';
export type ARichTextReconcileSource = 'native-input' | 'composition';
export type ARichTextSimpleMark = 'bold' | 'italic' | 'underline' | 'strike' | 'code';

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
const ARIA_FORWARD_ATTRIBUTES = [
  'aria-label',
  'aria-labelledby',
  'aria-describedby',
  'aria-required',
  'aria-invalid',
] as const;
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
        position: relative;
        white-space: pre-wrap;
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
      [part='editor'] table { border-collapse: collapse; width: 100%; }
      [part='editor'] td { border: 1px solid var(--art-border-color); padding: 0.4rem; min-width: 2rem; }
      [part='editor'] p { margin-block: 0 0.6em; }
      [part='editor'] li > :last-child, [part='editor'] td > :last-child { margin-bottom: 0; }
      [data-art-list='task'] { list-style: none; padding-inline-start: 0; }
      [data-art-list='task'] > li { position: relative; padding-inline-start: 1.75em; margin-block: 0.4em; }
      [data-art-list='task'] > li > input[type='checkbox'] {
        position: absolute; inset-inline-start: 0; inset-block-start: 0.3em;
        width: 1em; height: 1em; margin: 0; cursor: pointer;
      }
      [data-art-list='task'] > li > :not(input):first-of-type { margin-top: 0; }

      [part='editor']:focus-visible {
        outline: 2px solid currentColor;
        outline-offset: 2px;
      }

      :host([disabled]) [part='editor'] {
        cursor: not-allowed;
        opacity: 0.6;
      }

      [part='editor'][data-empty='true']::before {
        position: absolute;
        inset-block-start: 0.75rem;
        inset-inline-start: 0.75rem;
        content: attr(data-placeholder);
        opacity: 0.55;
        pointer-events: none;
      }
      [hidden] { display: none !important; }
      [part='view-switcher'] { display: flex; flex-wrap: wrap; gap: 0.25rem; margin-block: 0.4rem; }
      [part='view-switcher'] button, [part='source-actions'] button {
        font: inherit; color: inherit; padding: 0.4rem 0.7rem; cursor: pointer;
        border: 1px solid var(--art-border-color); border-radius: var(--art-radius); background: var(--art-background);
      }
      [part='view-switcher'] [aria-pressed='true'] { background: color-mix(in srgb, var(--art-color) 12%, var(--art-background)); }
      [part='source'] { display: block; width: 100%; min-height: 14rem; box-sizing: border-box; resize: vertical;
        padding: 0.75rem; font: 0.9rem/1.6 ui-monospace, monospace; color: inherit;
        border: 1px solid var(--art-border-color); border-radius: var(--art-radius); background: var(--art-background); }
      [part='source-actions'] { display: flex; gap: 0.4rem; margin-block: 0.5rem; }
      [part='source-note'], [part='source-error'] { font: 0.85rem/1.5 var(--art-font-family); margin-block: 0.4rem; }
      button:focus-visible, [part='source']:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
    </style>
    <div part="view-switcher" role="group" aria-label="Document view" hidden></div>
    <div part="editor" role="textbox" aria-multiline="true"></div>
    <section part="source-panel" hidden>
      <p part="source-note" id="source-note">Source edits apply only when you choose Apply changes. Applying clears undo history. JSON preserves the full document; other formats may lose unsupported formatting.</p>
      <textarea part="source" aria-label="Document source" aria-describedby="source-note source-error" spellcheck="false"></textarea>
      <div part="source-actions">
        <button type="button" data-source-action="apply">Apply changes</button>
        <button type="button" data-source-action="discard">Discard changes</button>
      </div>
      <p part="source-error" id="source-error" role="status" aria-live="polite"></p>
    </section>
  `;
  cachedTemplate = template;
  return template;
}

export class ARichTextElement extends HTMLElementBase {
  static readonly formAssociated = true;
  static readonly observedAttributes = [
    'disabled',
    'readonly',
    'placeholder',
    'value',
    'format',
    'required',
    'tools', 'views', 'view',
    ...ARIA_FORWARD_ATTRIBUTES,
  ];

  #internals: ElementInternals | null;
  #editor: HTMLDivElement;
  #engine: EditorEngine;
  #extensions?: ARichTextExtensionRuntime;
  #unsubscribeEngine?: () => void;
  #selectionDocument?: Document;
  #composing = false;
  #reconcileQueued = false;
  #storedMarks: ARTTextMark[] | null = null;
  #formDisabled = false;
  #activeView: ARichTextView = 'visual';
  #source: HTMLTextAreaElement;
  #sourceDirty = false;
  #sourceError = '';
  #sourceDocument = '';

  constructor() {
    super();
    if (typeof document === 'undefined' || typeof this.attachShadow !== 'function') {
      throw new Error('<a-rich-text> can only be instantiated in a browser DOM');
    }

    const shadow = this.attachShadow({ mode: 'open' });
    shadow.append(getTemplate().content.cloneNode(true));
    this.#editor = shadow.querySelector<HTMLDivElement>('[part="editor"]')!;
    this.#source = shadow.querySelector<HTMLTextAreaElement>('[part="source"]')!;
    this.#internals = typeof this.attachInternals === 'function' ? this.attachInternals() : null;
    this.#engine = this.#createEngine(createTextDocument(''));
    this.#renderFromEngine();
    this.#source.addEventListener('input', (event) => {
      event.stopPropagation();
      this.#sourceDirty = this.#source.value !== this.#serializeView();
      this.#sourceError = '';
      this.#syncViews();
      this.#syncFormValue();
    });
    this.#source.addEventListener('change', (event) => event.stopPropagation());
    shadow.querySelector('[part="view-switcher"]')!.addEventListener('click', (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>('[data-view]');
      if (button && !button.disabled) { this.view = button.dataset.view as ARichTextView; this.focus(); }
    });
    shadow.querySelector('[part="source-actions"]')!.addEventListener('click', (event) => {
      const action = (event.target as Element).closest<HTMLElement>('[data-source-action]')?.dataset.sourceAction;
      if (action === 'apply') this.applySource();
      if (action === 'discard') this.discardSource();
    });

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
    this.#syncViews();
  }

  disconnectedCallback(): void {
    this.#selectionDocument?.removeEventListener('selectionchange', this.#handleDocumentSelectionChange);
    this.#selectionDocument = undefined;
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue) return;
    if (name === 'view' || name === 'views') {
      const requested = this.getAttribute('view')?.toLowerCase() === 'md' ? 'markdown' : this.getAttribute('view');
      const next = this.views.includes(requested as ARichTextView) ? requested as ARichTextView : 'visual';
      if (this.#sourceDirty && next !== this.#activeView) {
        this.#sourceError = 'Apply or discard your source changes before switching views.';
        if (name === 'views') {
          if (oldValue === null) this.removeAttribute('views'); else this.setAttribute('views', oldValue);
        }
        this.setAttribute('view', this.#activeView);
      } else if (next !== this.#activeView) {
        this.#activeView = next;
        this.#source.value = this.#serializeView();
        this.#sourceDocument = this.serializeJSON();
        this.#sourceError = '';
        this.dispatchEvent(new CustomEvent('view-change', { bubbles: true, composed: true, detail: { view: next } }));
      }
    }
    if (name === 'value' && oldValue !== newValue && this.isConnected && !this.#editor.matches(':focus')) {
      this.value = newValue ?? '';
      return;
    }
    this.#syncState();
    this.#syncDerivedState();
    this.#syncFormValue();
    this.#syncViews();
  }

  get tools(): ARichTextTool[] {
    const value = this.getAttribute('tools');
    return value === null ? [...EDITOR_TOOLS] : tokens(value).filter((tool): tool is ARichTextTool => EDITOR_TOOLS.includes(tool as ARichTextTool));
  }
  set tools(value: readonly ARichTextTool[] | string) { this.setAttribute('tools', typeof value === 'string' ? value : value.join(' ')); }
  isToolEnabled(tool: string): boolean { return this.tools.includes(tool as ARichTextTool); }
  get views(): ARichTextView[] {
    return ['visual', ...tokens(this.getAttribute('views') ?? '').filter((view): view is Exclude<ARichTextView, 'visual'> => view !== 'visual' && EDITOR_VIEWS.includes(view as ARichTextView))];
  }
  set views(value: readonly ARichTextView[] | string) { this.setAttribute('views', typeof value === 'string' ? value : value.join(' ')); }
  get view(): ARichTextView { return this.#activeView; }
  set view(value: ARichTextView) { this.setAttribute('view', value); }
  get sourceDirty(): boolean { return this.#sourceDirty; }

  applySource(): boolean {
    if (this.disabled || this.readOnly || this.#activeView === 'visual') return false;
    if (!this.#sourceDirty) return true;
    try {
      if (this.#sourceDocument && this.#sourceDocument !== this.serializeJSON()) throw new Error('The document changed while you were editing source. Discard this draft and try again.');
      const value = this.#source.value;
      const document = this.#activeView === 'json' ? parseDocument(value)
        : this.#activeView === 'html' ? fromHTML(value, this.#extensions ? { extensions: this.#extensions } : {})
          : this.#activeView === 'markdown' ? fromMarkdown(value) : createTextDocument(value);
      this.#sourceDirty = false;
      this.#sourceError = '';
      this.setJSON(document);
      this.#source.value = this.#serializeView();
      this.#syncViews();
      this.#emitInput();
      return true;
    } catch (error) {
      this.#sourceError = `Cannot apply ${this.#activeView.toUpperCase()}: ${error instanceof Error ? error.message : 'Invalid document'}`;
      this.#syncViews();
      this.#syncFormValue();
      return false;
    }
  }

  discardSource(): void {
    this.#sourceDirty = false;
    this.#sourceError = '';
    this.#source.value = this.#serializeView();
    this.#sourceDocument = this.serializeJSON();
    this.#syncViews();
    this.#syncFormValue();
  }

  #serializeView(): string {
    if (this.#activeView === 'json') return JSON.stringify(this.getJSON(), null, 2);
    if (this.#activeView === 'html') return this.getHTML();
    if (this.#activeView === 'markdown') return this.getMarkdown();
    if (this.#activeView === 'text') return this.getText();
    return '';
  }

  #syncViews(): void {
    const switcher = this.shadowRoot!.querySelector<HTMLElement>('[part="view-switcher"]')!;
    const signature = this.views.join(' ');
    if (switcher.dataset.views !== signature) {
      switcher.replaceChildren(...this.views.map((view) => {
        const button = this.ownerDocument.createElement('button');
        button.type = 'button'; button.dataset.view = view;
        button.textContent = { visual: 'Editor', html: 'HTML', markdown: 'Markdown', json: 'JSON', text: 'Text' }[view];
        return button;
      }));
      switcher.dataset.views = signature;
    }
    switcher.hidden = this.views.length < 2;
    for (const button of switcher.querySelectorAll('button')) {
      button.setAttribute('aria-pressed', String(button.dataset.view === this.#activeView));
      button.disabled = this.disabled || (this.#sourceDirty && button.dataset.view !== this.#activeView);
    }
    this.#editor.hidden = this.#activeView !== 'visual';
    this.shadowRoot!.querySelector<HTMLElement>('[part="source-panel"]')!.hidden = this.#activeView === 'visual';
    this.#source.disabled = this.disabled;
    this.#source.readOnly = this.readOnly;
    this.#source.setAttribute('aria-label', `${this.#activeView.toUpperCase()} document source`);
    this.#source.setAttribute('aria-invalid', String(Boolean(this.#sourceError)));
    const actions = this.shadowRoot!.querySelector<HTMLElement>('[part="source-actions"]')!;
    actions.hidden = !this.#sourceDirty;
    actions.querySelector<HTMLButtonElement>('[data-source-action="apply"]')!.disabled = this.disabled || this.readOnly;
    actions.querySelector<HTMLButtonElement>('[data-source-action="discard"]')!.disabled = this.disabled;
    this.shadowRoot!.querySelector<HTMLElement>('[part="source-error"]')!.textContent = this.#sourceError;
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
    return this.hasAttribute('disabled') || this.#formDisabled;
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

  get required(): boolean { return this.hasAttribute('required'); }
  set required(value: boolean) { this.toggleAttribute('required', value); }
  get name(): string { return this.getAttribute('name') ?? ''; }
  set name(value: string) { this.setAttribute('name', value); }
  get form(): HTMLFormElement | null { return this.#internals?.form ?? null; }
  get validity(): ValidityState | undefined { return this.#internals?.validity; }
  get validationMessage(): string { return this.#internals?.validationMessage ?? ''; }
  get willValidate(): boolean { return this.#internals?.willValidate ?? false; }
  checkValidity(): boolean { return this.#internals?.checkValidity() ?? true; }
  reportValidity(): boolean { return this.#internals?.reportValidity() ?? true; }

  get canUndo(): boolean {
    return this.#engine.canUndo;
  }

  get canRedo(): boolean {
    return this.#engine.canRedo;
  }

  override focus(options?: FocusOptions): void {
    if (this.#activeView !== 'visual') { this.#source.focus(options); return; }
    this.#editor.focus(options);
    const selection = this.#engine.state.selection;
    if (selection) writeDOMSelection(this.#editor, selection);
  }

  clear(): void {
    this.setJSON(createTextDocument(''));
    this.#emitInput();
  }

  undo(): boolean {
    this.#storedMarks = null;
    const result = this.#engine.undo();
    if (!result) return false;
    this.#emitTransactionResult(result);
    return true;
  }

  redo(): boolean {
    this.#storedMarks = null;
    const result = this.#engine.redo();
    if (!result) return false;
    this.#emitTransactionResult(result);
    return true;
  }

  dispatch(transactionValue: EditorTransaction): TransactionResult {
    const result = this.#engine.dispatch(transactionValue);
    if (result.selectionChanged) this.#storedMarks = null;
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

  /** Set a mark on selected text, or on subsequent typing at the caret. */
  setMark(mark: ARTTextMark): boolean {
    return this.#changeMark(mark.type, cloneMark(mark));
  }

  /** Remove a mark from selected text, or from subsequent typing at the caret. */
  removeMark(type: ARTTextMark['type']): boolean {
    return this.#changeMark(type, null);
  }

  #changeMark(type: ARTTextMark['type'], mark: ARTTextMark | null): boolean {
    if (this.disabled || this.readOnly) return false;
    const selection = this.getSelection();
    if (!selection) return false;
    if (isCollapsedSelection(selection)) {
      const marks = this.getActiveMarks().filter((candidate) => candidate.type !== type);
      this.#storedMarks = mark ? [...marks, mark] : marks;
      this.#emitFormatState();
    } else {
      const command = transaction();
      if (mark) command.addMark(selection.anchor, selection.head, mark);
      else command.removeMark(selection.anchor, selection.head, type);
      this.dispatch(command.build());
    }
    return true;
  }

  toggleBlockquote(): boolean {
    if (this.disabled || this.readOnly) return false;
    const command = toggleBlockquote(this.#engine.state);
    if (!command) return false;
    this.dispatch(command);
    return true;
  }

  insertHorizontalRule(): boolean {
    if (this.disabled || this.readOnly) return false;
    const command = insertHorizontalRule(this.#engine.state);
    if (!command) return false;
    this.dispatch(command);
    return true;
  }

  clearFormatting(): boolean {
    if (this.disabled || this.readOnly || !this.getSelection()) return false;
    if (isCollapsedSelection(this.getSelection()!)) {
      this.#storedMarks = [];
      this.#emitFormatState();
    } else {
      const command = clearSelectionFormatting(this.#engine.state);
      if (!command) return false;
      this.dispatch(command);
    }
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
    this.#sourceDirty = false;
    this.#sourceError = '';
    this.value = this.getAttribute('value') ?? '';
  }

  formDisabledCallback(disabled: boolean): void {
    this.#formDisabled = disabled;
    this.#syncState();
    this.#syncFormValue();
    this.#emitFormatState();
    this.#syncViews();
  }

  formStateRestoreCallback(state: string | File | FormData): void {
    if (typeof state === 'string') this.setJSON(state);
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
    if (!this.#sourceDirty) {
      this.#source.value = this.#serializeView();
      this.#sourceDocument = this.serializeJSON();
    }
    this.#syncViews();
  }

  #handleEngineResult = (result: TransactionResult): void => {
    if (result.documentChanged) {
      this.#renderFromEngine();
      this.#syncDerivedState();
      this.#syncFormValue();
      if (!this.#sourceDirty) {
        this.#source.value = this.#serializeView();
        this.#sourceDocument = this.serializeJSON();
      }
    } else if (result.selectionChanged && result.state.selection && this.shadowRoot?.activeElement === this.#editor) {
      writeDOMSelection(this.#editor, result.state.selection);
    }
  };

  #handleBeforeInput = (event: InputEvent): void => {
    if (event.defaultPrevented) return;
    if (this.disabled || this.readOnly) {
      event.preventDefault();
      return;
    }

    if (this.#composing || !event.cancelable) return;

    const intent = classifyBeforeInput(event);
    if (!intent.intercept) return;
    if (intent.kind === 'toggleMark' && !this.isToolEnabled(intent.mark.type)) { event.preventDefault(); return; }
    if (intent.kind === 'historyUndo' && !this.isToolEnabled('undo')) { event.preventDefault(); return; }
    if (intent.kind === 'historyRedo' && !this.isToolEnabled('redo')) { event.preventDefault(); return; }

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
    if (event.defaultPrevented || this.disabled || this.readOnly || this.#composing || event.isComposing || event.altKey) return;

    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    let handled = false;
    const tool = mod && key === 'b' ? 'bold' : mod && key === 'i' ? 'italic'
      : mod && key === 'u' ? 'underline' : mod && key === 'z' ? (event.shiftKey ? 'redo' : 'undo')
        : event.ctrlKey && key === 'y' ? 'redo' : null;
    if (tool && !this.isToolEnabled(tool)) { event.preventDefault(); return; }

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
    this.#syncSelectionFromDOM();
    this.#emitFormatState();
  };

  #syncSelectionFromDOM(): void {
    const selection = readDOMSelection(this.#editor);
    if (!selection) return;
    const result = this.#engine.dispatch(transaction().setSelection(selection));
    if (result.selectionChanged) {
      this.#storedMarks = null;
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
      const copy = this.#editor.cloneNode(true) as HTMLElement;
      copy.querySelectorAll('[data-art-placeholder]').forEach((node) => node.remove());
      const document = fromHTML(
        copy.innerHTML,
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
    // Empty text blocks need a line box for native caret placement, especially
    // in table cells. This DOM-only break contributes no canonical text.
    for (const block of this.#editor.querySelectorAll('[data-art-text-block]')) {
      if (block.textContent === '' && block.childNodes.length === 0) {
        const placeholder = this.ownerDocument.createElement('br');
        placeholder.setAttribute('data-art-placeholder', '');
        block.append(placeholder);
      }
    }
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
    this.#editor.setAttribute('aria-required', String(this.required));
    this.#editor.tabIndex = this.disabled ? -1 : 0;

    for (const attribute of ARIA_FORWARD_ATTRIBUTES) {
      const value = this.getAttribute(attribute);
      if (value === null) this.#editor.removeAttribute(attribute);
      else this.#editor.setAttribute(attribute, value);
    }

    // ID references cannot cross into a shadow root. Element references can
    // point to labels/descriptions in the host's containing tree.
    const scope = this.getRootNode() as Document | ShadowRoot;
    for (const [attribute, property] of [
      ['aria-labelledby', 'ariaLabelledByElements'],
      ['aria-describedby', 'ariaDescribedByElements'],
    ] as const) {
      if (!(property in this.#editor)) continue;
      const elements = (this.getAttribute(attribute) ?? '').split(/\s+/)
        .map((id) => scope.getElementById?.(id))
        .filter((element): element is HTMLElement => element != null);
      // Retain unresolved IDs until connection; the next sync resolves them.
      if (elements.length > 0 || !this.hasAttribute(attribute)) this.#editor[property] = elements;
    }

    const placeholder = this.getAttribute('placeholder') ?? '';
    this.#editor.dataset.placeholder = placeholder;
    if (placeholder) this.#editor.setAttribute('aria-placeholder', placeholder);
    else this.#editor.removeAttribute('aria-placeholder');
  }

  #syncDerivedState(): void {
    const content = this.#engine.state.document.content;
    this.#editor.dataset.empty = String(content.length === 1 && content[0]?.type === 'paragraph' && this.getText().length === 0);
  }

  #syncFormValue(): void {
    this.#internals?.setFormValue(this.value, this.serializeJSON());
    const missing = this.required && !this.readOnly && !this.disabled && this.getText().trim().length === 0;
    const draft = this.#sourceDirty && !this.disabled && !this.readOnly;
    this.#internals?.setValidity?.(draft ? { customError: true } : missing ? { valueMissing: true } : {},
      draft ? 'Apply or discard your source changes before submitting.' : missing ? 'Please enter some text.' : '',
      this.#activeView === 'visual' ? this.#editor : this.#source);
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
