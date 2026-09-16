import { FormatProfileRegistry, artJSONProfile, type FormatProfile, type ConversionDiagnostic, type ConversionResult, type FormatProfileInfo } from '@arichtext/core/profiles';
export { FormatProfileRegistry, artJSONProfile, type FormatProfile, type ConversionDiagnostic, type ConversionResult, type FormatProfileInfo } from '@arichtext/core/profiles';
import { ARichTextSelectElement } from './select.js';
export { ARichTextSelectElement, defineARichTextSelect } from './select.js';
import { FindReplace } from './find-replace.js';
import { FocusMode } from './focus-mode.js';
import { ImageEditor, type ARichTextImageUploader } from './image-editor.js';
export type { ARichTextImageUploader, ARichTextImageUploadContext } from './image-editor.js';
import { CodeBlockEditor } from './code-editor.js';
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
  getSelectedBlockStyle as querySelectedBlockStyle,
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

export type ARichTextSourceFormatter = (source: string, format: Exclude<ARichTextView, 'visual'>) => string | Promise<string>;
export { detectInputFormat, type InputFormatDetection } from './detect-format.js';

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
        --art-font-size: var(--_art-font-size, 1rem);
        --art-line-height: var(--_art-line-height, 1.6);
        --art-color: CanvasText;
        --art-background: Canvas;
        --art-border-color: var(--_art-border-color, color-mix(in srgb, CanvasText 18%, transparent));
        --art-radius: 0.375rem;
        display: block;
        max-inline-size: var(--art-max-width, var(--_art-max-width, none));
        margin-inline: auto;
        font-family: var(--art-font-family);
        color: var(--art-color);
      }

      :host([preset='minimal']) {
        --_art-border-color: color-mix(in srgb, CanvasText 10%, transparent);
        --_art-padding: 0.75rem;
        --_art-min-height: 6rem;
      }
      :host([preset='document']) {
        --_art-font-size: 1.125rem;
        --_art-line-height: 1.8;
        --_art-padding: clamp(1.25rem, 5vw, 3.5rem);
        --art-font-family: Georgia, Cambria, serif;
        --_art-min-height: 22rem;
        --_art-paragraph-spacing: 1em;
      }

      [part='editor'] {
        position: relative;
        white-space: pre-wrap;
        min-height: var(--art-editor-min-height, var(--_art-min-height, 8rem));
        box-sizing: border-box;
        padding: var(--art-editor-padding, var(--_art-padding, 1.25rem));
        border: 0;
        border-radius: 0;
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
      [part='editor'] p { margin-block: 0 var(--art-paragraph-spacing, var(--_art-paragraph-spacing, 0.6em)); }
      [part='editor'] li > :last-child, [part='editor'] td > :last-child { margin-bottom: 0; }
      [data-art-list='task'] { list-style: none; padding-inline-start: 0; }
      [data-art-list='task'] > li { position: relative; padding-inline-start: 1.75em; margin-block: 0.4em; }
      [data-art-list='task'] > li > input[type='checkbox'] {
        position: absolute; inset-inline-start: 0; inset-block-start: 0.3em;
        width: 1em; height: 1em; margin: 0; cursor: pointer;
      }
      [data-art-list='task'] > li > :not(input):first-of-type { margin-top: 0; }

      [part='editor']:focus-visible { outline: var(--art-editor-focus-outline, 2px solid color-mix(in srgb,Highlight 35%,transparent)); outline-offset: -2px; }

      :host([disabled]) [part='editor'] {
        cursor: not-allowed;
        opacity: 0.6;
      }

      [part='editor'][data-empty='true']::before {
        position: absolute;
        inset-block-start: var(--art-editor-padding, var(--_art-padding, 1.25rem));
        inset-inline-start: var(--art-editor-padding, var(--_art-padding, 1.25rem));
        content: attr(data-placeholder);
        opacity: 0.55;
        pointer-events: none;
      }
      [part='editor'] pre { position: relative; overflow: visible; padding: 0.6rem; border: 1px solid var(--art-border-color); border-radius: var(--art-radius); }
      [part='image-edit-button'] { user-select: none; display: block; margin-block-start: 0.5rem; }
      [part='code-edit-button'] { position: absolute; inset-block-start: .35rem; inset-inline-end: .35rem; display: grid; place-items: center; width: 2rem; height: 2rem; margin: 0; border: 1px solid var(--art-border-color); border-radius: var(--art-radius); color: var(--art-color); background: var(--art-background); opacity: 0; user-select: none; }
      [part='editor'] pre [part='code-content'] { display: block; max-width: 100%; overflow-x: auto; box-sizing: border-box; padding-inline-end: 2.25rem; }
      [part='code-edit-button'] svg { width: 1rem; height: 1rem; }
      pre:hover [part='code-edit-button'], pre:focus-within [part='code-edit-button'] { opacity: 1; pointer-events: auto; }
      @media (hover: none) { [part='code-edit-button'] { opacity: 1; pointer-events: auto; } }
      :is([part='code-dialog'], [part='image-dialog']) { box-sizing: border-box; width: min(42rem, calc(100vw - 2rem)); max-height: calc(100dvh - 2rem); overflow: auto;
        color: var(--art-color); background: var(--art-background); border: 1px solid var(--art-border-color); border-radius: var(--art-radius); }
      :is([part='code-dialog'], [part='image-dialog'])::backdrop { background: rgb(0 0 0 / 35%); }
      :is([part='code-dialog'], [part='image-dialog']) h2 { font-size: 1.1rem; margin-block: 0 1rem; }
      :is([part='code-dialog'], [part='image-dialog']) label { display: block; margin-block: 0.6rem; }
      :is([part='code-dialog'], [part='image-dialog']) input, :is([part='code-dialog'], [part='image-dialog']) textarea { display: block; box-sizing: border-box; width: 100%; padding: 0.5rem;
        font: 1rem/1.5 ui-monospace, monospace; color: inherit; background: var(--art-background); border: 1px solid var(--art-border-color); }
      :is([part='code-dialog'], [part='image-dialog']) textarea { resize: vertical; }
      :is([part='code-dialog'], [part='image-dialog']) button, :is([part='code-edit-button'], [part='image-edit-button']) { font: inherit; padding: 0.35rem 0.6rem; cursor: pointer; }
      [part='image'] { max-width: 100%; height: auto; }
      [part='image-container'] { margin-block: 0.6rem; }
      [part='image-preview'] { display: block; max-width: 100%; max-height: 12rem; object-fit: contain; margin-block: 0.5rem; }
      .image-dimensions { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 0.75rem; }
      [part='image-dialog'] .image-choice { display: flex; align-items: center; gap: 0.5rem; }
      [part='image-dialog'] input[type='checkbox'] { display: inline-block; width: auto; }
      .image-actions, .code-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
      [part='find-panel'] { position: sticky; top: 0; z-index: 2; box-sizing: border-box; padding: 0.75rem; margin-block-end: 0.5rem;
        border: 1px solid var(--art-border-color); border-radius: var(--art-radius); background: var(--art-background); }
      .find-row, .find-options, .find-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: end; }
      .find-row + .find-options, .find-options + .find-row { margin-block-start: 0.5rem; }
      .find-row label { display: grid; gap: 0.2rem; flex: 1 1 12rem; min-width: 0; }
      .find-options label { display: flex; align-items: center; gap: 0.3rem; }
      [part='find-panel'] input[type='text'] { box-sizing: border-box; width: 100%; min-width: 0; padding: 0.4rem; font: inherit; color: inherit;
        background: var(--art-background); border: 1px solid var(--art-border-color); }
      [part='find-panel'] button { padding: 0.4rem; font: inherit; cursor: pointer; }
      [part='find-status'], [part='find-note'] { margin-block: 0.5rem 0; }
      [part='find-note'] { font-size: 0.85em; }
      [part='find-highlight'] { position: absolute; pointer-events: none; user-select: none; background: var(--art-find-highlight, rgb(255 190 0 / 30%));
        outline: 1px solid var(--art-find-outline, #b57900); }
      [part='focus-dialog'] { box-sizing: border-box; width: calc(100vw - 2rem); max-width: 80rem; height: calc(100dvh - 2rem); max-height: none;
        padding: 1rem; color: var(--art-color); background: var(--art-background); border: 1px solid var(--art-border-color); border-radius: var(--art-radius); }
      [part='focus-dialog'][open] { display: flex; flex-direction: column; gap: 0.75rem; }
      [part='focus-dialog']::backdrop { background: rgb(0 0 0 / 55%); }
      [part='focus-header'] { display: flex; flex-shrink: 0; align-items: center; justify-content: space-between; gap: 1rem; }
      [part='focus-exit-button'] { font: inherit; padding: 0.5rem; cursor: pointer; }
      [part='focus-toolbar'] { display: block; flex-shrink: 0; max-height: 35dvh; overflow: auto; }
      [part='focus-content'] { flex: 1; min-height: 0; overflow: auto; }
      [part='focus-content'] [part='editor'] { min-height: max(var(--art-editor-min-height, var(--_art-min-height, 8rem)), 50dvh); }
      [part='focus-content'] [part='source'] { min-height: 45dvh; }
      [hidden] { display: none !important; }
      [part='view-switcher'] { display: flex; align-items: center; flex-wrap: wrap; gap: 0.25rem; margin-block: 0.4rem; }
      [part='source-actions'] button {
        font: inherit; color: inherit; padding: 0.4rem 0.7rem; cursor: pointer;
        border: 1px solid var(--art-border-color); border-radius: var(--art-radius); background: var(--art-background);
      }
      [part='source'] { display: block; width: 100%; min-height: var(--art-editor-min-height, var(--_art-min-height, 8rem)); box-sizing: border-box; resize: vertical;
        padding: var(--art-editor-padding, var(--_art-padding, 1.25rem)); font: 0.9rem/1.6 ui-monospace, monospace; color: inherit;
        border: 0; border-radius: 0; outline: none; background: var(--art-background); }
      [part='source-actions'] { display: flex; gap: 0.4rem; }
      [part='source-error'] { font: 0.85rem/1.5 var(--art-font-family); margin-block: 0.4rem; }
      button:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
    </style>
    <div part="view-switcher" role="toolbar" aria-label="Document source tools" hidden><a-rich-text-select label="Document format" exportparts="trigger:view-trigger,menu:view-menu"></a-rich-text-select>      <div part="source-actions">
        <button part="source-format-button" data-source-action="format" type="button" hidden>Format source</button>
        <button part="source-apply-button" type="button" data-source-action="apply">Apply changes</button>
        <button part="source-discard-button" type="button" data-source-action="discard">Discard changes</button>
      </div></div>
    <p part="profile-error" role="status" hidden></p>
    <div part="editor" role="textbox" aria-multiline="true"></div>
    <section part="source-panel" hidden>
      <textarea part="source" aria-label="Document source" aria-describedby="source-error" spellcheck="false"></textarea>

      <p part="source-error" id="source-error" role="status" aria-live="polite"></p>
    </section>
  `;
  cachedTemplate = template;
  return template;
}

export type ARichTextPreset = 'default' | 'minimal' | 'document';

export class ARichTextElement extends HTMLElementBase {
  static readonly formAssociated = true;
  static readonly observedAttributes = [
    'disabled',
    'readonly',
    'placeholder',
    'value',
    'format',
    'required',
    'tools', 'views', 'view', 'source-update', 'profile', 'profiles', 'source-profile', 'profile-loss',
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
  #viewToolbars = 0;
  #sourceError = '';
  #sourceDocument = '';
  #sourceAccepted = '';
  #sourceTimer?: ReturnType<typeof setTimeout>;
  #sourceComposing = false;
  #sourceFormatter?: ARichTextSourceFormatter;
  #sourceRevision = 0;
  #profiles = new FormatProfileRegistry();
  #profileError = '';
  #sourceDiagnostics: readonly ConversionDiagnostic[] = [];
  #sourceLossPending = false;
  #sourceExportDiagnostics: readonly ConversionDiagnostic[] = [];
  #profileChanging = false;
  #pendingProfileValue: string | null = null;
  #pendingSourceProfile = false;
  #codeEditor: CodeBlockEditor;
  #imageEditor: ImageEditor;
  #focusMode: FocusMode;
  #findReplace: FindReplace;

  constructor() {
    super();
    if (typeof document === 'undefined' || typeof this.attachShadow !== 'function') {
      throw new Error('<a-rich-text> can only be instantiated in a browser DOM');
    }

    const shadow = this.attachShadow({ mode: 'open' });
    shadow.append(getTemplate().content.cloneNode(true));
    this.ownerDocument.defaultView?.customElements.upgrade(shadow);
    this.#editor = shadow.querySelector<HTMLDivElement>('[part="editor"]')!;
    this.#source = shadow.querySelector<HTMLTextAreaElement>('[part="source"]')!;
    this.#internals = typeof this.attachInternals === 'function' ? this.attachInternals() : null;
    this.#engine = this.#createEngine(createTextDocument(''));
    this.#profiles.register(artJSONProfile);
    this.#profiles.register({ id: 'art:html-v1', family: 'html', label: 'HTML', import: source => ({ value: fromHTML(source, this.#extensions ? { extensions: this.#extensions } : {}) }), export: document => ({ value: toHTML(document, this.#extensions ? { extensions: this.#extensions } : {}) }) });
    this.#profiles.register({ id: 'art:markdown-v1', family: 'markdown', label: 'Markdown', import: source => ({ value: fromMarkdown(source) }), export: document => ({ value: toMarkdown(document) }) });
    this.#profiles.register({ id: 'art:text-v1', family: 'text', label: 'Text', import: source => ({ value: createTextDocument(source) }), export: document => ({ value: toPlainText(document) }) });
    this.#codeEditor = new CodeBlockEditor(this);
    this.#imageEditor = new ImageEditor(this);
    this.#findReplace = new FindReplace(this);
    this.#focusMode = new FocusMode(this, () => { this.#codeEditor.close(false); this.#imageEditor.close(false); });
    this.#renderFromEngine();
    this.#source.addEventListener('input', (event) => {
      event.stopPropagation();
      this.#sourceRevision++;
      this.#sourceLossPending = false; this.#sourceDiagnostics = [];
      this.#sourceDirty = this.#source.value !== this.#sourceAccepted || this.#sourceDocument !== this.serializeJSON();
      this.#sourceError = '';
      this.#syncViews();
      this.#syncFormValue();
      this.#scheduleSourceUpdate();
    });
    this.#source.addEventListener('compositionstart', () => { this.#sourceComposing = true; this.#cancelSourceUpdate(); });
    this.#source.addEventListener('compositionend', () => { this.#sourceComposing = false; this.#scheduleSourceUpdate(); });
    this.#source.addEventListener('blur', () => { if (this.sourceUpdate === 'auto' && !this.#sourceComposing) this.#applySource(true); });
    this.#source.addEventListener('change', (event) => event.stopPropagation());
    shadow.querySelector('[part="view-switcher"] a-rich-text-select')!.addEventListener('change', event => {
      event.stopPropagation(); this.selectView((event.target as ARichTextSelectElement).value);
    });
    shadow.querySelector('[part="source-actions"]')!.addEventListener('pointerdown', event => event.preventDefault());
    shadow.querySelector('[part="source-actions"]')!.addEventListener('click', (event) => {
      const action = (event.target as Element).closest<HTMLElement>('[data-source-action]')?.dataset.sourceAction;
      if (action === 'format') void this.formatSource();
      if (action === 'apply') this.applySource(this.#sourceLossPending);
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
      if (this.hasAttribute('profile')) this.#pendingProfileValue = this.getAttribute('value') ?? '';
      else this.value = this.getAttribute('value') ?? '';
    }
    this.#selectionDocument = this.ownerDocument;
    this.#selectionDocument.addEventListener('selectionchange', this.#handleDocumentSelectionChange);
    this.#refreshProfiles(false);
    this.#syncState();
    this.#syncDerivedState();
    this.#syncFormValue();
    this.#syncViews();
  }

  disconnectedCallback(): void {
    this.#sourceComposing = false;
    this.#sourceRevision++;
    this.#cancelSourceUpdate();
    this.#findReplace.close(false, true);
    this.#focusMode.close(false);
    this.#codeEditor.close(false);
    this.#imageEditor.close(false);
    this.#selectionDocument?.removeEventListener('selectionchange', this.#handleDocumentSelectionChange);
    this.#selectionDocument = undefined;
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue || this.#profileChanging) return;
    if (['profile', 'profiles', 'source-profile', 'profile-loss'].includes(name)) {
      if (this.#sourceDirty && (name === 'source-profile' || name === 'profiles')) {
        this.#profileChanging = true;
        if (oldValue === null) this.removeAttribute(name); else this.setAttribute(name, oldValue);
        this.#profileChanging = false;
        this.#sourceError = 'Apply or discard source changes before changing profiles.';
        this.#syncViews(); this.#syncFormValue(); return;
      }
      if (name === 'source-profile') this.#pendingSourceProfile = newValue !== null;
      this.#refreshProfiles(name === 'source-profile'); return;
    }
    if ((name === 'view' || name === 'views') && this.sourceUpdate === 'auto' && !this.#sourceComposing) this.#applySource(true);
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
        const sourceProfile = this.#profiles.list().find(profile => profile.id === this.getAttribute('source-profile'));
        if (next !== 'visual' && sourceProfile && sourceProfile.family !== next) {
          this.#profileChanging = true; this.removeAttribute('source-profile'); this.#profileChanging = false; this.#pendingSourceProfile = false;
        }
        this.#sourceRevision++;
        this.#sourceDiagnostics = []; this.#sourceLossPending = false;
        this.#activeView = next;
        this.#source.value = this.#serializeView();
        this.#sourceAccepted = this.#source.value;
        this.#sourceDocument = this.serializeJSON();
        this.#sourceError = '';
        this.dispatchEvent(new CustomEvent('view-change', { bubbles: true, composed: true, detail: { view: next } }));
      }
    }
    if (name === 'value' && oldValue !== newValue && this.isConnected && !this.#editor.matches(':focus')) {
      if (this.hasAttribute('profile')) {
        if (!this.#profiles.list().some(profile => profile.id === this.profile)) {
          this.#pendingProfileValue = newValue ?? ''; this.#refreshProfiles(false); return;
        }
        try { if (newValue === null) this.setText(''); else this.value = newValue; this.#refreshProfiles(false); }
        catch (error) { this.#profileError = error instanceof Error ? error.message : 'Cannot import profile value'; this.#syncViews(); this.#syncFormValue(); }
      } else this.value = newValue ?? '';
      return;
    }
    if (['format', 'views', 'view'].includes(name)) this.#refreshProfiles(false);
    this.#syncState();
    this.#syncDerivedState();
    this.#syncFormValue();
    this.#syncViews();
  }

  /** Appearance only; unknown or missing attributes use the default preset. */
  get preset(): ARichTextPreset {
    const value = this.getAttribute('preset');
    return value === 'minimal' || value === 'document' ? value : 'default';
  }
  set preset(value: ARichTextPreset) { this.setAttribute('preset', value); }

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
  set view(value: ARichTextView) {
    if (!this.#sourceDirty && value !== 'visual' && this.getAttribute('source-profile') && this.#profiles.list().find(p => p.id === this.getAttribute('source-profile'))?.family !== value) {
      this.#profileChanging = true; this.removeAttribute('source-profile'); this.#profileChanging = false;
    }
    this.setAttribute('view', value);
  }
  get sourceDirty(): boolean { return this.#sourceDirty; }

  /** Optional formatter; kept outside the base bundle. Plain text is never formatted. */
  get sourceFormatter(): ARichTextSourceFormatter | undefined { return this.#sourceFormatter; }
  set sourceFormatter(formatter: ARichTextSourceFormatter | undefined) { this.#sourceFormatter = formatter; this.#sourceRevision++; this.#syncViews(); }

  async formatSource(): Promise<boolean> {
    const formatter = this.#sourceFormatter;
    const view = this.view;
    if (!formatter || view === 'visual' || view === 'text' || this.disabled || this.readOnly || this.#profileError || !this.#sourceCanImport() || this.#sourceComposing) return false;
    this.#cancelSourceUpdate();
    const source = this.#source.value;
    const revision = this.#sourceRevision;
    const document = this.serializeJSON();
    const current = () => this.isConnected && revision === this.#sourceRevision && this.view === view && this.#source.value === source && this.serializeJSON() === document && !this.disabled && !this.readOnly && !this.#sourceComposing;
    try {
      const formatted = await formatter(source, view);
      if (!current()) return false;
      if (typeof formatted !== 'string') throw new TypeError('Formatter must return a string');
      this.#source.value = formatted;
      this.#source.dispatchEvent(new Event('input'));
      return true;
    } catch (error) {
      if (current()) {
        this.#sourceError = `Cannot format source: ${error instanceof Error ? error.message : 'Formatting failed'}`;
        this.#syncViews(); this.#syncFormValue();
      }
      return false;
    } finally {
      this.#scheduleSourceUpdate();
    }
  }

  /** Manual remains the default. Automatic source updates settle after 350 ms or blur. */
  get sourceUpdate(): 'manual' | 'auto' { return this.getAttribute('source-update') === 'auto' ? 'auto' : 'manual'; }
  set sourceUpdate(value: 'manual' | 'auto') { this.setAttribute('source-update', value); }

  #cancelSourceUpdate(): void { clearTimeout(this.#sourceTimer); this.#sourceTimer = undefined; }
  #scheduleSourceUpdate(): void {
    this.#cancelSourceUpdate();
    if (this.isConnected && this.sourceUpdate === 'auto' && this.#sourceDirty && !this.#sourceError && !this.#profileError && !this.#sourceLossPending && !this.#sourceComposing && !this.disabled && !this.readOnly) {
      this.#sourceTimer = setTimeout(() => this.#applySource(true), 350);
    }
  }

  applySource(acceptLosses = false): boolean { return this.#applySource(this.sourceUpdate === 'auto', acceptLosses); }

  #applySource(preserveSource: boolean, acceptLosses = false): boolean {
    this.#cancelSourceUpdate();
    if (this.disabled || this.readOnly || this.#profileError || !this.#sourceCanImport() || this.#sourceComposing || this.#activeView === 'visual') return false;
    if (!this.#sourceDirty) return true;
    try {
      if (this.#sourceDocument && this.#sourceDocument !== this.serializeJSON()) throw new Error('The document changed while you were editing source. Discard this draft and try again.');
      const value = this.#source.value;
      let document: ARTDocument;
      if (this.getAttribute('source-profile')) {
        const converted = this.#profiles.import(this.sourceProfile, value, this.#activeView as ARichTextFormat);
        this.#sourceDiagnostics = [...this.#sourceExportDiagnostics, ...converted.diagnostics];
        if (!converted.ok) throw new Error(converted.diagnostics.map(note => note.message).join(' '));
        this.#sourceLossPending = this.#sourceDiagnostics.some(note => note.severity === 'loss');
        if (this.#sourceLossPending && !acceptLosses) { this.#syncViews(); this.#syncFormValue(); return false; }
        document = converted.value;
      } else {
        document = this.#activeView === 'json' ? parseDocument(value)
          : this.#activeView === 'html' ? fromHTML(value, this.#extensions ? { extensions: this.#extensions } : {})
            : this.#activeView === 'markdown' ? fromMarkdown(value) : createTextDocument(value);
      }
      const changed = serializeDocument(document) !== this.serializeJSON();
      this.#sourceError = '';
      if (changed) this.setJSON(document);
      this.#sourceDirty = false; this.#sourceLossPending = false;
      if (!preserveSource) this.#source.value = this.#serializeView();
      this.#sourceAccepted = this.#source.value;
      this.#sourceDocument = this.serializeJSON();
      this.#syncViews();
      this.#syncFormValue();
      if (changed) this.#emitInput();
      return true;
    } catch (error) {
      this.#sourceError = `Cannot apply ${this.#activeView.toUpperCase()}: ${error instanceof Error ? error.message : 'Invalid document'}`;
      this.#syncViews();
      this.#syncFormValue();
      return false;
    }
  }

  discardSource(): void {
    this.#sourceRevision++;
    this.#cancelSourceUpdate();
    this.#sourceDirty = false; this.#sourceLossPending = false; this.#sourceDiagnostics = [];
    this.#sourceError = '';
    this.#source.value = this.#serializeView();
    this.#sourceAccepted = this.#source.value;
    this.#sourceDocument = this.serializeJSON();
    this.#syncViews();
    this.#syncFormValue();
  }

  #serializeView(): string {
    if (this.#activeView !== 'visual' && this.getAttribute('source-profile')) {
      const result = this.#profiles.export(this.sourceProfile, this.getJSON(), this.#activeView as ARichTextFormat);
      this.#sourceDiagnostics = result.diagnostics; this.#sourceExportDiagnostics = result.diagnostics;
      if (!result.ok) { this.#sourceError = result.diagnostics.map(note => note.message).join(' '); return ''; }
      return result.value;
    }
    this.#sourceExportDiagnostics = []; this.#sourceDiagnostics = [];
    if (this.#activeView === 'json') return JSON.stringify(this.getJSON(), null, 2);
    if (this.#activeView === 'html') return this.getHTML();
    if (this.#activeView === 'markdown') return this.getMarkdown();
    if (this.#activeView === 'text') return this.getText();
    return '';
  }

  #syncViews(): void {
    const profileError = this.shadowRoot!.querySelector<HTMLElement>('[part="profile-error"]')!;
    profileError.textContent = this.#profileError; profileError.hidden = !this.#profileError;
    const switcher = this.shadowRoot!.querySelector<HTMLElement>('[part="view-switcher"]')!;
    const select = switcher.querySelector<ARichTextSelectElement>('a-rich-text-select')!;
    this.configureViewSelect(select);
    switcher.hidden = this.views.length < 2 || this.#viewToolbars > 0;
    this.#editor.hidden = this.#activeView !== 'visual';
    this.shadowRoot!.querySelector<HTMLElement>('[part="source-panel"]')!.hidden = this.#activeView === 'visual';
    this.#source.disabled = this.disabled;
    this.#source.readOnly = this.readOnly || !!this.#profileError || !this.#sourceCanImport();
    this.#source.setAttribute('aria-label', `${this.#activeView.toUpperCase()} document source`);
    this.#source.setAttribute('aria-invalid', String(Boolean(this.#sourceError)));
    const actions = this.shadowRoot!.querySelector<HTMLElement>('[part="source-actions"]')!;
    this.configureSourceActions(actions);
    this.shadowRoot!.querySelector<HTMLElement>('[part="source-error"]')!.textContent = this.#profileError || this.#sourceError || this.#sourceDiagnostics.map(note => note.message).join(' ');
    this.dispatchEvent(new CustomEvent('view-state-change'));
    this.#scheduleSourceUpdate();
  }

  /** Shared source-action state for bundled and custom toolbars. */
  configureSourceActions(actions: HTMLElement): void {
    const canFormat = Boolean(this.#sourceFormatter) && this.view !== 'text' && this.view !== 'visual';
    actions.hidden = this.view === 'visual' || (this.sourceUpdate !== 'auto' && !this.#sourceDirty && !canFormat);
    const formatButton = actions.querySelector<HTMLButtonElement>('[data-source-action="format"]')!;
    formatButton.hidden = !canFormat; formatButton.disabled = this.disabled || this.readOnly || !!this.#profileError || !this.#sourceCanImport();
    actions.querySelector<HTMLButtonElement>('[data-source-action="discard"]')!.hidden = this.sourceUpdate !== 'auto' && !this.#sourceDirty;
    actions.querySelector<HTMLButtonElement>('[data-source-action="apply"]')!.hidden = (this.sourceUpdate === 'auto' && !this.#sourceLossPending) || !this.#sourceDirty;
    actions.querySelector<HTMLButtonElement>('[data-source-action="apply"]')!.disabled = this.disabled || this.readOnly || !!this.#profileError || !this.#sourceCanImport();
    actions.querySelector<HTMLButtonElement>('[data-source-action="discard"]')!.disabled = this.disabled || !this.#sourceDirty;
  }

  /** Shared view-control state for bundled and custom toolbars. */
  configureViewSelect(select: ARichTextSelectElement): void {
    const configured = this.hasAttribute('profiles') || Boolean(this.getAttribute('source-profile'));
    const allowed = this.hasAttribute('profiles') ? tokens(this.getAttribute('profiles') ?? '') : [...this.views.filter(v => v !== 'visual').map(v => `art:${v}-v1`), this.sourceProfile];
    const options = configured ? this.#profiles.list().filter(p => p.canExport && allowed.includes(p.id) && this.views.includes(p.family))
      .map(p => ({ value: p.id, label: `${p.family.toUpperCase()} — ${p.label}`, family: p.family }))
      : this.views.filter(view => view !== 'visual').map(view => ({ value: view, label: { html: 'HTML', markdown: 'Markdown', json: 'ART JSON', text: 'Text' }[view] }));
    const entries = [{ value: 'visual', label: 'Editor' }, ...options];
    const signature = JSON.stringify(entries);
    if (select.dataset.views !== signature) {
      select.replaceChildren();
      const groups = new Map<string, HTMLOptGroupElement>();
      for (const entry of entries) {
        const option = this.ownerDocument.createElement('option'); option.value = entry.value; option.textContent = entry.label;
        if (configured && 'family' in entry) {
          const family = String(entry.family);
          let group = groups.get(family);
          if (!group) { group = this.ownerDocument.createElement('optgroup'); group.label = family.toUpperCase(); groups.set(family, group); select.append(group); }
          group.append(option);
        } else select.append(option);
      }
      select.dataset.views = signature;
    }
    const selected = this.view === 'visual' ? 'visual' : configured ? this.sourceProfile : this.view;
    select.value = selected; select.disabled = this.disabled || !!this.#profileError;
    for (const option of select.options) {
      const disabled = this.#sourceDirty && option.value !== selected;
      if (option.disabled !== disabled) option.disabled = disabled;
    }
  }

  registerViewToolbar(): () => void {
    this.#viewToolbars++; this.#syncViews(); let released = false;
    return () => { if (!released) { released = true; this.#viewToolbars--; this.#syncViews(); } };
  }

  get profile(): string { return this.getAttribute('profile') ?? `art:${this.format}-v1`; }
  set profile(value: string) { this.setAttribute('profile', value); }
  get sourceProfile(): string { return this.getAttribute('source-profile') ?? (this.view === 'visual' ? '' : `art:${this.view}-v1`); }
  set sourceProfile(value: string) { this.setAttribute('source-profile', value); }
  get profiles(): readonly string[] { return tokens(this.getAttribute('profiles') ?? ''); }
  set profiles(value: readonly string[] | string) { this.setAttribute('profiles', typeof value === 'string' ? value : value.join(' ')); }
  get sourceDiagnostics(): readonly ConversionDiagnostic[] { return this.#sourceDiagnostics.map(note => ({ ...note })); }
  get formatProfiles(): readonly FormatProfileInfo[] { return this.#profiles.list(); }
  registerFormatProfile(profile: FormatProfile): () => void {
    const id = profile.id;
    const activate = !!this.#profileError;
    const dispose = this.#profiles.register(profile); this.#refreshProfiles(activate);
    let released = false;
    return () => {
      if (released) return;
      if (this.profile === id || this.sourceProfile === id || tokens(this.getAttribute('profiles') ?? '').includes(id)) throw new Error('Remove profile references before unregistering it');
      dispose(); released = true; this.#refreshProfiles(false);
    };
  }
  importProfile(id: string, source: string): ConversionResult<ARTDocument> { return this.#profiles.import(id, source); }
  exportProfile(id: string): ConversionResult<string> { return this.#profiles.export(id, this.getJSON()); }
  selectView(value: string): void {
    if (this.#sourceDirty) return;
    if (value === 'visual') { this.view = 'visual'; return; }
    if (value.includes(':')) { this.sourceProfile = value; return; }
    this.#profileChanging = true; this.removeAttribute('source-profile'); this.#profileChanging = false;
    this.view = value as ARichTextView; this.#refreshProfiles(false);
  }
  #sourceCanImport(): boolean { return !this.getAttribute('source-profile') || Boolean(this.#profiles.list().find(p => p.id === this.sourceProfile)?.canImport); }
  #refreshProfiles(activateSource = true): void {
    const previousError = this.#profileError;
    this.#profileError = '';
    const profiles = this.#profiles.list();
    const output = profiles.find(p => p.id === this.profile);
    if (!output || output.family !== this.format || !output.canExport) this.#profileError = 'Unknown, mismatched or non-exportable output profile';
    const allowed = this.hasAttribute('profiles') ? tokens(this.getAttribute('profiles') ?? '') : null;
    if (allowed?.some(id => !profiles.some(p => p.id === id && p.canExport))) this.#profileError = 'Source profile allowlist contains an unknown or non-exportable profile';
    const id = this.getAttribute('source-profile');
    const source = profiles.find(p => p.id === id);
    if (!id && allowed && this.view !== 'visual' && !allowed.includes(this.sourceProfile)) this.#profileError = 'Current source profile is not in the allowlist';
    if (id !== null && (!source || !source.canExport || !this.views.includes(source.family) || (allowed && !allowed.includes(id)))) this.#profileError = 'Unknown, unavailable or disallowed source profile';
    if (this.hasAttribute('profile-loss') && !['reject', 'allow'].includes(this.getAttribute('profile-loss')!)) this.#profileError = 'profile-loss must be reject or allow';
    if (!this.#profileError && (activateSource || this.#pendingSourceProfile) && source && !this.#sourceDirty) {
      this.#pendingSourceProfile = false;
      this.#sourceError = ''; this.#sourceLossPending = false;
      const previousView = this.#activeView;
      this.#activeView = source.family;
      if (previousView !== source.family) this.dispatchEvent(new CustomEvent('view-change', { bubbles: true, composed: true, detail: { view: source.family, profile: source.id } }));
      this.#profileChanging = true; this.setAttribute('view', source.family); this.#profileChanging = false;
      this.#source.value = this.#serializeView(); this.#sourceAccepted = this.#source.value; this.#sourceDocument = this.serializeJSON(); this.#sourceRevision++;
    }
    if (!this.#profileError && !id && !this.#sourceDirty && this.view !== 'visual') {
      this.#source.value = this.#serializeView(); this.#sourceAccepted = this.#source.value; this.#sourceDocument = this.serializeJSON(); this.#sourceRevision++;
    }
    if (!this.#profileError && this.#pendingProfileValue !== null) {
      const pending = this.#pendingProfileValue; this.#pendingProfileValue = null;
      try { this.value = pending; } catch (error) { this.#profileError = error instanceof Error ? error.message : 'Cannot import initial value'; }
    }
    if (this.#profileError && previousError !== this.#profileError) this.dispatchEvent(new CustomEvent('profile-error', { bubbles: true, composed: true, detail: { message: this.#profileError } }));
    // Activating a profile changes the view without the ordinary attribute path.
    // Refresh visual-only panels/dialogs just as a direct view switch does.
    this.#syncState();
    this.#syncViews(); this.#syncFormValue();
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
    if (this.hasAttribute('profile')) {
      const result = this.#profiles.export(this.profile, this.getJSON(), this.format);
      if (!result.ok || (this.getAttribute('profile-loss') !== 'allow' && result.diagnostics.some(note => note.severity === 'loss'))) throw new TypeError(result.diagnostics.map(note => note.message).join(' '));
      return result.value;
    }
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
    if (this.hasAttribute('profile')) {
      const result = this.#profiles.import(this.profile, value, this.format);
      if (!result.ok || (this.getAttribute('profile-loss') !== 'allow' && result.diagnostics.some(note => note.severity === 'loss'))) throw new TypeError(result.diagnostics.map(note => note.message).join(' '));
      this.setJSON(result.value); return;
    }
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

  getSelectedBlockStyle(): ActiveBlock | 'mixed' | null {
    return querySelectedBlockStyle(this.#engine.state);
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

  get findReplaceOpen(): boolean { return this.#findReplace.active; }
  openFindReplace(query?: string): boolean { return this.#findReplace.open(query); }
  closeFindReplace(): void { this.#findReplace.close(); }

  get focusMode(): boolean { return this.#focusMode.active; }
  toggleFocusMode(force = !this.focusMode): boolean {
    if (force) return this.#focusMode.open();
    this.#focusMode.close(); return true;
  }
  /** Register a light-DOM toolbar to travel into focus mode; call the returned cleanup on disposal. */
  registerFocusToolbar(toolbar: HTMLElement): () => void { return this.#focusMode.registerToolbar(toolbar); }

  /** Optional host-owned upload callback. No upload service is installed by default. */
  get imageUploader(): ARichTextImageUploader | undefined { return this.#imageEditor.uploader; }
  set imageUploader(value: ARichTextImageUploader | undefined) { this.#imageEditor.uploader = value; }

  openImageEditor(path: readonly number[] | null = null): boolean {
    return this.#imageEditor.open(path);
  }

  /** Open a code draft at the selection, or edit a code block at its ART path. */
  openCodeEditor(path: readonly number[] | null = null): boolean {
    return this.#codeEditor.open(path);
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
    this.#sourceComposing = false;
    this.#sourceRevision++;
    this.#cancelSourceUpdate();
    this.#findReplace.close(false, true);
    this.#focusMode.close(false);
    this.#codeEditor.close(false);
    this.#imageEditor.close(false);
    this.#sourceDirty = false; this.#sourceLossPending = false; this.#sourceDiagnostics = [];
    this.#sourceError = '';
    if (this.getAttribute('profile') && !this.hasAttribute('value')) this.setText('');
    else this.value = this.getAttribute('value') ?? '';
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
      this.#sourceAccepted = this.#source.value;
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
        this.#sourceAccepted = this.#source.value;
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
      copy.querySelectorAll('[data-art-placeholder], [data-art-editor-ui]').forEach((node) => node.remove());
      copy.querySelectorAll('[data-art-image-wrapper]').forEach(node => node.replaceWith(...node.childNodes));
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
    this.#codeEditor.sync();
    this.#imageEditor.sync();
    this.#findReplace.refresh();
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
    this.#findReplace.refresh();
    this.#focusMode.sync();
    this.#codeEditor.sync();
    this.#imageEditor.sync();
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
    let error = this.#profileError;
    try { this.#internals?.setFormValue(error ? null : this.value, this.serializeJSON()); }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Cannot serialize the selected profile'; this.#internals?.setFormValue(null); }
    if (error) { this.#internals?.setValidity?.({ customError: true }, error, this.#activeView === 'visual' ? this.#editor : this.#source); return; }
    const missing = this.required && !this.readOnly && !this.disabled && this.getText().trim().length === 0;
    const draft = this.#sourceDirty && !this.disabled && !this.readOnly;
    this.#internals?.setValidity?.(draft ? { customError: true } : missing ? { valueMissing: true } : {},
      draft ? (this.sourceUpdate === 'auto' ? 'Source changes are pending or invalid. Wait for updates, correct the source or discard changes.' : 'Apply or discard your source changes before submitting.') : missing ? 'Please enter some text.' : '',
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
  if (!customElements.get(tagName)) customElements.define(tagName, tagName === 'a-rich-text' ? ARichTextElement : class extends ARichTextElement {});
}

defineARichText();
defineARichText('art-editor');

declare global {
  interface HTMLElementTagNameMap {
    'a-rich-text': ARichTextElement;
    'art-editor': ARichTextElement;
  }
}
