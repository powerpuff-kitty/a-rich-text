export { ARichTextShellElement, defineARichTextShell } from './shell.js';
import { ARichTextSelectElement } from '@arichtext/web-component';
import { toolbarIcon } from './icons.js';
import {
  createLinkMark,
} from '@arichtext/links';
import { getActiveList, toggleList, indentListItem, outdentListItem, type ListStyle } from '@arichtext/lists';
import {
  addTableColumn,
  addTableRow,
  getActiveTable,
  getTableCellActions,
  getTableRowActions,
  mergeTableCellRight,
  mergeTableCellBelow,
  splitTableCell,
  insertTable,
  removeCurrentTable,
  removeCurrentTableColumn,
  removeCurrentTableRow,
} from '@arichtext/tables';
import type { ARichTextElement, ARichTextSimpleMark } from '@arichtext/web-component';

const HTMLElementBase: typeof HTMLElement = typeof HTMLElement === 'undefined'
  ? class {} as unknown as typeof HTMLElement
  : HTMLElement;

const MARK_ACTIONS: ReadonlyArray<{ action: ARichTextSimpleMark; label: string; text: string }> = [
  { action: 'bold', label: 'Bold', text: 'B' },
  { action: 'italic', label: 'Italic', text: 'I' },
  { action: 'underline', label: 'Underline', text: 'U' },
  { action: 'strike', label: 'Strikethrough', text: 'S' },
  { action: 'code', label: 'Inline code', text: '</>' },
];

const LIST_ACTIONS: ReadonlyArray<{ action: string; style: ListStyle; label: string; text: string }> = [
  { action: 'bullet-list', style: 'bullet', label: 'Bullet list', text: '•' },
  { action: 'ordered-list', style: 'ordered', label: 'Numbered list', text: '1.' },
  { action: 'task-list', style: 'task', label: 'Task list', text: '☑' },
];

let cachedTemplate: HTMLTemplateElement | undefined;

function getTemplate(): HTMLTemplateElement {
  if (typeof document === 'undefined') {
    throw new Error('<a-rich-text-toolbar> can only be instantiated in a browser DOM');
  }
  if (cachedTemplate) return cachedTemplate;

  const template = document.createElement('template');
  template.innerHTML = `
    <style>
      :host {
        --art-toolbar-font: ui-sans-serif, system-ui, sans-serif;
        --art-toolbar-background: Canvas;
        --art-toolbar-color: CanvasText;
        --_art-toolbar-border: color-mix(in srgb, CanvasText 18%, transparent);
        --art-toolbar-active: color-mix(in srgb, CanvasText 12%, transparent);
        --art-toolbar-radius: 0.375rem;
        display: block;
        color: var(--art-toolbar-color);
        font-family: var(--art-toolbar-font);
      }

      [part='toolbar-header'] { display:flex; align-items:center; gap:.75rem; padding:.4rem .6rem; font-size:.8rem; color:GrayText; }
      [part='source-actions'] { display: inline-flex; align-items:center; gap:.25rem; }
      [part='toolbar-header'] { flex-wrap:wrap; }
      [part='toolbar-header'][hidden] { display:none; }
      [part='toolbar'][popover] { position:fixed; inset:auto; margin:0; width:max-content; max-width:calc(100vw - 16px); max-height:calc(100dvh - 16px); overflow:auto; border:1px solid #d5dbe5; border-radius:8px; box-shadow:0 6px 28px #0003; background:var(--art-inline-toolbar-background,Canvas); z-index:9999; }
      [part='toolbar'] {
        display: flex;
        align-items: center;
        gap: var(--art-toolbar-gap, var(--_art-toolbar-gap, 0.25rem));
        box-sizing: border-box;
        width: 100%;
        flex-wrap: wrap;
        max-width: min(100%, var(--art-toolbar-max-width, var(--_art-toolbar-max-width, 100%)));
        margin-inline: auto;
        padding: var(--art-toolbar-padding, var(--_art-toolbar-padding, 0.25rem));
        border: 0;
        border-radius: 0;
        background: var(--art-toolbar-background);
        overflow: visible;
      }

      [part='toolbar'][data-preset='minimal'] {
        --_art-toolbar-gap: 0.125rem;
        --_art-toolbar-padding: 0.125rem;
        --_art-toolbar-border: color-mix(in srgb, CanvasText 10%, transparent);
      }
      [part='toolbar'][data-preset='document'] {
        --_art-toolbar-padding: 0.5rem;
      }

      [part~='button'],
      [part='block-select'],
      [part='link-input'] {
        min-height: 2rem;
        box-sizing: border-box;
        border: 0;
        border-radius: calc(var(--art-toolbar-radius) * 0.75);
        background: transparent;
        color: inherit;
        font: inherit;
      }

      [part~='button'] {
        min-width: 2rem;
        display: inline-grid;
        place-items: center;
        padding: 0 0.5rem;
        cursor: pointer;
      }

      [part~='button'][aria-pressed='true'] {
        background: var(--art-toolbar-active);
      }

      [hidden] { display: none !important; }
      svg { width: 1em; height: 1em; vertical-align: middle; }
      .icon-pair { display: inline-flex; align-items: center; gap: 0.15rem; }
      .icon-pair svg:last-child { width: 0.65em; height: 0.65em; }
      [part~='button']:focus-visible,
      [part='block-select']:focus-visible,
      [part='link-input']:focus-visible {
        outline: 2px solid currentColor;
        outline-offset: 1px;
      }

      [part~='button']:disabled,
      [part='block-select']:disabled {
        cursor: not-allowed;
        opacity: 0.45;
      }

      [part='separator'] {
        width: 1px;
        align-self: stretch;
        margin: 0.2rem;
        background: var(--art-toolbar-border, var(--_art-toolbar-border));
      }

      [part='block-select'] {
        width: auto;
        padding-inline: 0.4rem;
        cursor: pointer;
      }

      [part='link-editor'] {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto auto auto;
        box-sizing: border-box;
        gap: 0.25rem;
        width: min(100%, 36rem);
        margin-top: 0.25rem;
        padding: 0.25rem;
        border: 1px solid var(--art-toolbar-border, var(--_art-toolbar-border));
        border-radius: var(--art-toolbar-radius);
        background: var(--art-toolbar-background);
      }

      [part='link-editor'][hidden] { display: none; }

      [part='link-input'] {
        min-width: 0;
        padding-inline: 0.5rem;
        border: 1px solid var(--art-toolbar-border, var(--_art-toolbar-border));
      }

      [part='link-error'] {
        grid-column: 1 / -1;
        min-height: 1em;
        font-size: 0.875em;
      }
    </style>
    <div part="toolbar-header" hidden><span data-inline-hint>Select text to format · Alt+F10</span></div>
    <div part="toolbar" role="toolbar" aria-label="Text formatting">
      <a-rich-text-select part="format-select" label="Document format" exportparts="trigger:view-trigger,menu:view-menu" data-role="view"></a-rich-text-select>
      <span part="source-actions" hidden>
        ${[['format', 'Format source'], ['apply', 'Apply changes'], ['discard', 'Discard changes']].map(([action, label]) => `<button part="button source-${action}-button" type="button" data-source-action="${action}" aria-label="${label}" title="${label}">${toolbarIcon('source-' + action)}</button>`).join('')}
      </span>
      <a-rich-text-select part="block-select" label="Text style" data-role="block">
        <option value="mixed" disabled hidden>Mixed styles</option>
        <option value="paragraph">Paragraph</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
        <option value="h4">Heading 4</option>
        <option value="h5">Heading 5</option>
        <option value="h6">Heading 6</option>
      </a-rich-text-select>
      <span part="separator" aria-hidden="true"></span>
      ${MARK_ACTIONS.map(({ action, label, text }) => `
        <button
          part="button ${action}-button"
          type="button"
          data-action="${action}"
          aria-label="${label}"
          title="${label}"
          aria-pressed="false"
        >${toolbarIcon(action)}</button>
      `).join('')}
      <button part="button link-button" type="button" data-action="link" aria-label="Link" title="Link (Ctrl/⌘+K)" aria-pressed="false">${toolbarIcon('link')}</button>
      <span part="separator" aria-hidden="true"></span>
      ${LIST_ACTIONS.map(({ action, label, text }) => `
        <button
          part="button ${action}-button"
          type="button"
          data-action="${action}"
          aria-label="${label}"
          title="${label}"
          aria-pressed="false"
        >${toolbarIcon(action)}</button>
      `).join('')}
      <span part="separator" aria-hidden="true"></span>
      ${[['image', 'Insert image'], ['code-block', 'Insert code block'], ['blockquote', 'Toggle blockquote'], ['horizontal-rule', 'Insert horizontal rule'], ['clear-formatting', 'Clear inline formatting']].map(([action, label]) => `<button part="button" type="button" data-action="${action}" aria-label="${label}" title="${label}">${toolbarIcon(action!)}</button>`).join('')}
      <button part="button indent-button" type="button" data-action="indent" aria-label="Indent list item" title="Indent list item (Tab)">${toolbarIcon('indent')}</button>
      <button part="button outdent-button" type="button" data-action="outdent" aria-label="Outdent list item" title="Outdent list item (Shift+Tab)">${toolbarIcon('outdent')}</button>
      <button part="button insert-table-button" type="button" data-action="insert-table" aria-label="Insert table" title="Insert 2 × 2 table">${toolbarIcon('insert-table')}</button>
      <button part="button merge-cell-right-button" type="button" data-action="merge-cell-right" aria-label="Merge with right cell" title="Merge with right cell">${toolbarIcon('merge-cell-right')}</button>
      <button part="button merge-cell-below-button" type="button" data-action="merge-cell-below" aria-label="Merge with cell below" title="Merge with cell below">${toolbarIcon('merge-cell-below')}</button>
      <button part="button split-cell-button" type="button" data-action="split-cell" aria-label="Split cell" title="Split cell">${toolbarIcon('split-cell')}</button>
      <button part="button remove-table-button" type="button" data-action="remove-table" aria-label="Remove table" title="Remove entire table">${toolbarIcon('remove-table')}</button>
      <button part="button add-row-button" type="button" data-action="add-row" aria-label="Add table row" title="Add row">${toolbarIcon('add-row')}</button>
      <button part="button remove-row-button" type="button" data-action="remove-row" aria-label="Remove table row" title="Remove row">${toolbarIcon('remove-row')}</button>
      <button part="button add-column-button" type="button" data-action="add-column" aria-label="Add table column" title="Add column">${toolbarIcon('add-column')}</button>
      <button part="button remove-column-button" type="button" data-action="remove-column" aria-label="Remove table column" title="Remove column">${toolbarIcon('remove-column')}</button>
      <span part="separator" aria-hidden="true"></span>
      <button part="button undo-button" type="button" data-action="undo" aria-label="Undo" title="Undo">${toolbarIcon('undo')}</button>
      <button part="button find-replace-button" type="button" data-action="find-replace" aria-label="Find and replace" title="Find and replace (Ctrl/⌘+F)" aria-pressed="false">${toolbarIcon('find-replace')}</button>
      <button part="button focus-mode-button" type="button" data-action="focus-mode" aria-label="Enter focus mode" title="Enter focus mode" aria-pressed="false">${toolbarIcon('focus-mode')}</button>
      <button part="button redo-button" type="button" data-action="redo" aria-label="Redo" title="Redo">${toolbarIcon('redo')}</button>
    </div>
    <form part="link-editor" data-role="link-editor" hidden aria-label="Edit link">
      <input
        part="link-input"
        data-role="link-input"
        type="text"
        inputmode="url"
        autocomplete="url"
        spellcheck="false"
        aria-label="Link URL"
        placeholder="https://example.com"
      >
      <button part="button link-apply-button" type="submit" data-link-action="apply">Apply</button>
      <button part="button link-remove-button" type="button" data-link-action="remove">Remove</button>
      <button part="button link-cancel-button" type="button" data-link-action="cancel">Cancel</button>
      <span part="link-error" data-role="link-error" aria-live="polite"></span>
    </form>
  `;
  cachedTemplate = template;
  return template;
}

export class ARichTextToolbarElement extends HTMLElementBase {
  static readonly observedAttributes = ['for', 'mode'];

  #editor: ARichTextElement | null = null;
  #toolbar: HTMLDivElement;
  #blockSelect: ARichTextSelectElement;
  #viewSelect: ARichTextSelectElement;
  #releaseViewToolbar?: () => void;
  #inlineRequested = false;
  #inlineDismissed = false;
  #inlineFocusing = false;
  #linkEditor: HTMLFormElement;
  #linkInput: HTMLInputElement;
  #linkError: HTMLSpanElement;
  #editorObserver?: MutationObserver;
  #releaseFocusToolbar?: () => void;

  constructor() {
    super();
    if (typeof document === 'undefined' || typeof this.attachShadow !== 'function') {
      throw new Error('<a-rich-text-toolbar> can only be instantiated in a browser DOM');
    }

    const shadow = this.attachShadow({ mode: 'open' });
    shadow.append(getTemplate().content.cloneNode(true));
    this.ownerDocument.defaultView?.customElements.upgrade(shadow);
    this.#toolbar = shadow.querySelector<HTMLDivElement>('[part="toolbar"]')!;
    this.#blockSelect = shadow.querySelector<ARichTextSelectElement>('[data-role="block"]')!;
    this.#linkEditor = shadow.querySelector<HTMLFormElement>('[data-role="link-editor"]')!;
    this.#linkInput = shadow.querySelector<HTMLInputElement>('[data-role="link-input"]')!;
    this.#linkError = shadow.querySelector<HTMLSpanElement>('[data-role="link-error"]')!;

    shadow.addEventListener('pointerdown', this.#handlePointerDown);
    shadow.addEventListener('keydown', event => {
      if ((event as KeyboardEvent).key !== 'Escape' || this.getAttribute('mode') !== 'inline' || this.#toolbar.hidden) return;
      event.preventDefault(); event.stopPropagation();
      this.#inlineDismissed = true; this.#inlineRequested = false; this.#syncInline(); this.#editor?.focus();
    });
    shadow.addEventListener('click', this.#handleClick);
    for (const type of ['input', 'change']) shadow.addEventListener(type, event => event.stopPropagation());
    this.#viewSelect = shadow.querySelector<ARichTextSelectElement>('[data-role="view"]')!;
    this.#viewSelect.addEventListener('change', () => {
      if (this.#editor) this.#editor.selectView(this.#viewSelect.value);
    });
    this.#blockSelect.addEventListener('change', this.#handleBlockChange);
    this.#linkEditor.addEventListener('submit', this.#handleLinkSubmit);
    this.#linkInput.addEventListener('keydown', this.#handleLinkInputKeyDown);
  }

  connectedCallback(): void {
    this.ownerDocument.addEventListener('pointerdown', this.#outsideInline, true);
    this.ownerDocument.addEventListener('scroll', this.#positionInline, true);
    this.ownerDocument.defaultView?.addEventListener('resize', this.#positionInline);
    this.ownerDocument.defaultView?.visualViewport?.addEventListener('resize', this.#positionInline);
    this.ownerDocument.defaultView?.visualViewport?.addEventListener('scroll', this.#positionInline);
    this.#resolveEditor();
    // A toolbar can connect before its editor sibling is upgraded/connected.
    queueMicrotask(() => { if (this.isConnected && !this.#editor) this.#resolveEditor(); });
    this.#refresh();
  }

  disconnectedCallback(): void {
    this.ownerDocument.removeEventListener('pointerdown', this.#outsideInline, true);
    this.ownerDocument.removeEventListener('scroll', this.#positionInline, true);
    this.ownerDocument.defaultView?.removeEventListener('resize', this.#positionInline);
    this.ownerDocument.defaultView?.visualViewport?.removeEventListener('resize', this.#positionInline);
    this.ownerDocument.defaultView?.visualViewport?.removeEventListener('scroll', this.#positionInline);
    queueMicrotask(() => { if (!this.isConnected) this.#bindEditor(null); });
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (name === 'for' && oldValue !== newValue && this.isConnected) this.#resolveEditor();
    if (name === 'mode' && oldValue !== newValue && this.isConnected) this.#refresh();
  }

  get editor(): ARichTextElement | null {
    return this.#editor;
  }

  set editor(value: ARichTextElement | null) {
    this.#bindEditor(value);
  }

  refresh(): void {
    this.#refresh();
  }

  #resolveEditor(): void {
    const id = this.getAttribute('for');
    if (!id) {
      this.#bindEditor(this.#editor);
      return;
    }
    const candidate = this.ownerDocument.getElementById(id);
    this.#bindEditor(isARichTextElement(candidate) ? candidate : null);
  }

  #bindEditor(editor: ARichTextElement | null): void {
    if (this.#editor === editor) {
      this.#refresh();
      return;
    }

    this.#releaseFocusToolbar?.(); this.#releaseFocusToolbar = undefined;
    this.#releaseViewToolbar?.(); this.#releaseViewToolbar = undefined;
    if (this.#editor) {
      for (const eventName of observedEditorEvents) {
        this.#editor.removeEventListener(eventName, this.#handleEditorStateChange);
      }
      this.#editor.removeEventListener('keydown', this.#handleEditorKeyDown);
    }
    this.#editorObserver?.disconnect();
    this.#editorObserver = undefined;

    this.#editor = editor;
    this.#closeLinkEditor();
    if (editor) {
      this.#releaseFocusToolbar = editor.registerFocusToolbar(this);
      this.#releaseViewToolbar = editor.registerViewToolbar();
      for (const eventName of observedEditorEvents) {
        editor.addEventListener(eventName, this.#handleEditorStateChange);
      }
      editor.addEventListener('keydown', this.#handleEditorKeyDown);
      if (typeof MutationObserver !== 'undefined') {
        this.#editorObserver = new MutationObserver(this.#handleEditorStateChange);
        this.#editorObserver.observe(editor, {
          attributes: true,
          attributeFilter: ['disabled', 'readonly', 'tools', 'view', 'views', 'preset'],
        });
      }
      if (editor.id) this.#toolbar.setAttribute('aria-controls', editor.id);
      else this.#toolbar.removeAttribute('aria-controls');
    } else {
      this.#toolbar.removeAttribute('aria-controls');
    }
    this.#refresh();
  }

  #outsideInline = (event: Event): void => {
    if (!event.composedPath().includes(this) && !event.composedPath().includes(this.#editor!)) {
      this.#inlineDismissed = true; this.#inlineRequested = false; this.#syncInline();
    }
  };
  #syncInline(): void {
    if (this.getAttribute('mode') !== 'inline') {
      if (this.#toolbar.hasAttribute('popover')) {
        if (typeof this.#toolbar.hidePopover === 'function' && this.#toolbar.matches(':popover-open')) this.#toolbar.hidePopover();
        this.#toolbar.removeAttribute('popover'); this.#toolbar.style.removeProperty('left'); this.#toolbar.style.removeProperty('top');
      }
      return;
    }
    this.#toolbar.setAttribute('popover', 'manual');
    const selection = this.#editor?.getSelection();
    const range = selection && (String(selection.anchor.blockPath) !== String(selection.head.blockPath) || selection.anchor.offset !== selection.head.offset);
    const hasControls = Array.from(this.#toolbar.children).some(child => !(child as HTMLElement).hidden && child.getAttribute('part') !== 'separator');
    const show = this.isConnected && hasControls && !this.#inlineDismissed && (range || this.#inlineRequested) && this.#editor?.view === 'visual' && !this.#editor.disabled && !this.#editor.readOnly;
    this.#toolbar.hidden = !show;
    if (show) {
      if (typeof this.#toolbar.showPopover === 'function' && !this.#toolbar.matches(':popover-open')) this.#toolbar.showPopover();
      this.#positionInline();
    } else if (typeof this.#toolbar.hidePopover === 'function' && this.#toolbar.matches(':popover-open')) this.#toolbar.hidePopover();
  }
  #positionInline = (): void => {
    if (this.getAttribute('mode') !== 'inline' || this.#toolbar.hidden || !this.#editor) return;
    const root = this.#editor.shadowRoot!;
    const selection = (root as ShadowRoot & { getSelection?: () => Selection | null }).getSelection?.() ?? this.ownerDocument.getSelection();
    let range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    // Document-level ranges can be retargeted to the shadow host (a zero rect).
    const composed = selection?.getComposedRanges?.({ shadowRoots: [root] })[0];
    if (composed && root.contains(composed.startContainer) && root.contains(composed.endContainer)) {
      range = this.ownerDocument.createRange();
      range.setStart(composed.startContainer, composed.startOffset);
      range.setEnd(composed.endContainer, composed.endOffset);
    }
    const measured = range?.getBoundingClientRect();
    const rect = measured && measured.height > 0 ? measured : this.#editor.getBoundingClientRect();
    const box = this.#toolbar.getBoundingClientRect();
    const win = this.ownerDocument.defaultView!;
    const viewport = win.visualViewport;
    const left = viewport?.offsetLeft ?? 0, top = viewport?.offsetTop ?? 0;
    const width = viewport?.width ?? win.innerWidth, height = viewport?.height ?? win.innerHeight;
    this.#toolbar.style.left = `${Math.max(left + 8, Math.min(rect.left, left + width - box.width - 8))}px`;
    this.#toolbar.style.top = `${Math.max(top + 8, Math.min(rect.top - box.height - 8 >= top + 8 ? rect.top - box.height - 8 : rect.bottom + 8, top + height - box.height - 8))}px`;
  };

  #handleEditorStateChange = (event?: Event | MutationRecord[]): void => {
    if (event instanceof Event && event.type === 'selection-change') {
      this.#inlineDismissed = false;
      // A delayed DOM selection event must not close a keyboard-opened toolbar
      // after Alt+F10 has moved focus into its controls.
      const root = this.getRootNode() as Document | ShadowRoot;
      const toolbarFocused = root.activeElement === this && this.#toolbar.contains(this.shadowRoot?.activeElement ?? null);
      if (!toolbarFocused && !this.#inlineFocusing) this.#inlineRequested = false;
    }
    this.#refresh();
  };

  #handleEditorKeyDown = (event: Event): void => {
    if (event.composedPath().includes(this)) return;
    const keyboard = event as KeyboardEvent;
    if (keyboard.key === 'Escape' && this.getAttribute('mode') === 'inline' && !this.#toolbar.hidden) { keyboard.preventDefault(); this.#inlineDismissed = true; this.#inlineRequested = false; this.#syncInline(); return; }
    if (keyboard.altKey && keyboard.key === 'F10' && this.getAttribute('mode') === 'inline') {
      keyboard.preventDefault(); this.#inlineRequested = true; this.#inlineDismissed = false; this.#refresh();
      // focus() first blurs the editor, which can synchronously report its final
      // selection before the toolbar becomes the active element.
      this.#inlineFocusing = true;
      try {
        this.#toolbar.querySelector<HTMLButtonElement>('button:not([hidden]):not(:disabled)')?.focus();
      } finally {
        this.#inlineFocusing = false;
      }
      return;
    }
    if (!this.#editor || this.#editor.disabled || this.#editor.readOnly || this.#editor.view !== 'visual' || !this.#editor.isToolEnabled('link')) return;
    if (!(keyboard.ctrlKey || keyboard.metaKey) || keyboard.altKey || keyboard.shiftKey) return;
    if (keyboard.key.toLowerCase() !== 'k') return;
    if (keyboard.defaultPrevented || keyboard.isComposing || !this.#editor.getSelection()) return;
    keyboard.preventDefault();
    this.#openLinkEditor();
  };

  #handlePointerDown = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest('button');
    if (!button || button.closest('[data-role="link-editor"]')) return;
    event.preventDefault();
  };

  #handleClick = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const sourceButton = target.closest<HTMLButtonElement>('button[data-source-action]');
    if (sourceButton && !sourceButton.hidden && !sourceButton.disabled && this.#editor) {
      const action = sourceButton.dataset.sourceAction;
      if (action === 'format') void this.#editor.formatSource();
      if (action === 'apply') this.#editor.applySource(this.#editor.sourceDiagnostics.some(note => note.severity === 'loss'));
      if (action === 'discard') this.#editor.discardSource();
      return;
    }
    const linkAction = target.closest<HTMLButtonElement>('button[data-link-action]')?.dataset.linkAction;
    if (linkAction === 'remove') {
      this.#removeLink();
      return;
    }
    if (linkAction === 'cancel') {
      this.#closeLinkEditor(true);
      return;
    }

    const button = target.closest<HTMLButtonElement>('button[data-action]');
    if (!button || button.disabled || button.hidden || !this.#editor || !this.#editor.isToolEnabled(button.dataset.action ?? '')) return;
    const action = button.dataset.action;

    if (isMarkAction(action)) {
      this.#finishEditorAction(this.#editor.toggleMark(action));
      return;
    }
    if (action === 'find-replace') { this.#editor.openFindReplace(); return; }
    if (action === 'focus-mode') { this.#editor.toggleFocusMode(); return; }
    if (action === 'link') {
      this.#openLinkEditor();
      return;
    }
    if (isListAction(action)) {
      const spec = LIST_ACTIONS.find((candidate) => candidate.action === action)!;
      this.#dispatchCommand(toggleList(editorState(this.#editor), spec.style));
      return;
    }
    if (action === 'image') {
      this.#editor.openImageEditor();
      return;
    }
    if (action === 'code-block') {
      this.#editor.openCodeEditor();
      return;
    }
    if (action === 'blockquote' || action === 'horizontal-rule' || action === 'clear-formatting') {
      this.#finishEditorAction(action === 'blockquote' ? this.#editor.toggleBlockquote()
        : action === 'horizontal-rule' ? this.#editor.insertHorizontalRule() : this.#editor.clearFormatting());
      return;
    }
    if (action === 'indent' || action === 'outdent') {
      this.#dispatchCommand((action === 'indent' ? indentListItem : outdentListItem)(editorState(this.#editor)));
      return;
    }
    if (action === 'insert-table') {
      this.#dispatchCommand(insertTable(editorState(this.#editor), { rows: 2, columns: 2 }));
      return;
    }
    if (action === 'add-row') {
      this.#dispatchCommand(addTableRow(editorState(this.#editor)));
      return;
    }
    if (action === 'remove-row') {
      this.#dispatchCommand(removeCurrentTableRow(editorState(this.#editor)));
      return;
    }
    if (action === 'add-column') {
      this.#dispatchCommand(addTableColumn(editorState(this.#editor)));
      return;
    }
    if (action === 'merge-cell-right' || action === 'merge-cell-below' || action === 'split-cell') {
      this.#dispatchCommand((action === 'merge-cell-right' ? mergeTableCellRight : action === 'merge-cell-below' ? mergeTableCellBelow : splitTableCell)(editorState(this.#editor)));
      return;
    }
    if (action === 'remove-table') {
      this.#dispatchCommand(removeCurrentTable(editorState(this.#editor)));
      return;
    }
    if (action === 'remove-column') {
      this.#dispatchCommand(removeCurrentTableColumn(editorState(this.#editor)));
      return;
    }
    if (action === 'undo') {
      this.#finishEditorAction(this.#editor.undo());
      return;
    }
    if (action === 'redo') this.#finishEditorAction(this.#editor.redo());
  };

  #handleBlockChange = (): void => {
    if (!this.#editor || this.#blockSelect.disabled) return;
    const value = this.#blockSelect.value;
    const handled = value === 'paragraph'
      ? this.#editor.setParagraph()
      : /^h[1-6]$/.test(value)
        ? this.#editor.setHeading(Number.parseInt(value.slice(1), 10) as 1 | 2 | 3 | 4 | 5 | 6)
        : false;
    this.#finishEditorAction(handled);
  };

  #handleLinkSubmit = (event: SubmitEvent): void => {
    event.preventDefault();
    this.#applyLink();
  };

  #handleLinkInputKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.#closeLinkEditor(true);
    }
  };

  #openLinkEditor(): void {
    if (!this.#editor || this.#editor.disabled || this.#editor.readOnly || this.#editor.view !== 'visual' || !this.#editor.isToolEnabled('link') || !this.#editor.getSelection()) return;
    this.#linkEditor.hidden = false;
    this.#linkInput.value = safeActiveLink(this.#editor) ?? '';
    this.#linkInput.removeAttribute('aria-invalid');
    this.#linkError.textContent = '';
    const remove = this.shadowRoot?.querySelector<HTMLButtonElement>('[data-link-action="remove"]');
    if (remove) remove.disabled = !safeActiveLink(this.#editor);
    queueMicrotask(() => {
      this.#linkInput.focus();
      this.#linkInput.select();
    });
  }

  #closeLinkEditor(refocusEditor = false): void {
    this.#linkEditor.hidden = true;
    this.#linkError.textContent = '';
    this.#linkInput.removeAttribute('aria-invalid');
    if (refocusEditor) this.#editor?.focus({ preventScroll: true });
  }

  #applyLink(): void {
    if (!this.#editor || this.#editor.disabled || this.#editor.readOnly || this.#editor.view !== 'visual' || !this.#editor.isToolEnabled('link')) return;
    try {
      if (!this.#editor.setMark(createLinkMark(this.#linkInput.value))) return;
      this.#closeLinkEditor(true);
      this.#refresh();
    } catch (error) {
      this.#linkInput.setAttribute('aria-invalid', 'true');
      this.#linkError.textContent = error instanceof Error ? error.message : 'Invalid link';
      this.#linkInput.focus();
    }
  }

  #removeLink(): void {
    if (!this.#editor || this.#editor.view !== 'visual' || !this.#editor.isToolEnabled('link') || !this.#editor.removeMark('link')) return;
    this.#closeLinkEditor(true);
    this.#refresh();
  }

  #dispatchCommand(command: ReturnType<typeof toggleList>): void {
    if (!this.#editor || this.#editor.disabled || this.#editor.readOnly || !command) return;
    try {
      this.#editor.dispatch(command);
      this.#finishEditorAction(true);
    } catch {
      this.#refresh();
    }
  }

  #finishEditorAction(handled: boolean): void {
    if (handled) this.#editor?.focus({ preventScroll: true });
    this.#refresh();
  }

  #refresh(): void {
    const editor = this.#editor;
    const header = this.shadowRoot!.querySelector<HTMLElement>('[part="toolbar-header"]')!;
    const inlineMode = this.getAttribute('mode') === 'inline';
    header.hidden = !inlineMode;
    const viewParent = inlineMode ? header : this.#toolbar;
    if (this.#viewSelect.parentNode !== viewParent) viewParent.prepend(this.#viewSelect);
    const sourceActions = this.shadowRoot!.querySelector<HTMLElement>('[part="source-actions"]')!;
    if (sourceActions.parentNode !== viewParent) this.#viewSelect.after(sourceActions);
    if (editor) editor.configureSourceActions(sourceActions); else sourceActions.hidden = true;
    header.querySelector<HTMLElement>('[data-inline-hint]')!.hidden = editor?.view !== 'visual';
    this.#toolbar.dataset.preset = editor?.preset ?? 'default';
    this.#viewSelect.hidden = !editor || editor.views.length < 2;
    if (editor) editor.configureViewSelect(this.#viewSelect);
    const locked = !editor || editor.disabled || editor.readOnly;
    const activeMarks = new Set(editor?.getActiveMarks().map((mark) => mark.type) ?? []);
    const state = editor ? editorState(editor) : null;
    const selectionAvailable = Boolean(editor?.getSelection());
    const activeLink = editor ? safeActiveLink(editor) : null;
    const activeList = state ? safeActiveList(state) : null;
    const activeTable = state ? safeActiveTable(state) : null;
    const cellActions = state ? getTableCellActions(state) : null;
    const rowActions = state ? getTableRowActions(state) : null;
    const selection = state?.selection;
    const singleBlock = Boolean(selection && String(selection.anchor.blockPath) === String(selection.head.blockPath));
    const visual = editor?.view === 'visual';
    const inline = Boolean(editor?.getActiveBlock());
    const insideTable = Boolean(state && selection && pathContainsTable(state.document, selection.anchor.blockPath));

    for (const button of this.shadowRoot?.querySelectorAll<HTMLButtonElement>('button[data-action]') ?? []) {
      const action = button.dataset.action;
      let available = selectionAvailable && inline;
      if (isMarkAction(action)) {
        button.disabled = locked;
        button.setAttribute('aria-pressed', String(activeMarks.has(action)));
      } else if (action === 'link') {
        button.disabled = locked || !selectionAvailable;
        button.setAttribute('aria-pressed', String(activeLink !== null));
      } else if (isListAction(action)) {
        const spec = LIST_ACTIONS.find((candidate) => candidate.action === action)!;
        button.disabled = locked;
        button.setAttribute('aria-pressed', String(activeList?.style === spec.style));
        available = singleBlock && inline;
      } else if (action === 'image' || action === 'code-block' || action === 'blockquote' || action === 'horizontal-rule') {
        available = singleBlock && inline;
        button.disabled = locked || !available;
      } else if (action === 'clear-formatting') {
        button.disabled = locked;
      } else if (action === 'indent' || action === 'outdent') {
        available = singleBlock && activeList !== null && (action === 'outdent' || activeList.itemIndex > 0);
        button.disabled = locked || !available;
      } else if (action === 'merge-cell-right' || action === 'merge-cell-below' || action === 'split-cell') {
        available = Boolean(action === 'merge-cell-right' ? cellActions?.canMergeRight : action === 'merge-cell-below' ? cellActions?.canMergeBelow : cellActions?.canSplit);
        button.disabled = locked || !available;
      } else if (action === 'remove-table') {
        available = singleBlock && insideTable;
      } else if (action === 'insert-table') {
        available = singleBlock && inline && !insideTable;
        button.disabled = locked || !available;
      } else if (action === 'add-row' || action === 'remove-row') {
        available = Boolean(action === 'add-row' ? rowActions?.canAddRow : rowActions?.canRemoveRow);
        button.disabled = locked || !available;
      } else if (action === 'add-column' || action === 'remove-column') {
        button.disabled = locked || activeTable === null
          || (action === 'remove-column' && activeTable.columns <= 1)
          || (action === 'add-column' && activeTable.columns >= 50);
        available = singleBlock && !button.disabled;
      } else if (action === 'undo') {
        button.disabled = locked || !editor?.canUndo;
        available = Boolean(editor?.canUndo);
      } else if (action === 'redo') {
        button.disabled = locked || !editor?.canRedo;
        available = Boolean(editor?.canRedo);
      }
      if (action !== 'find-replace' && action !== 'focus-mode') {
        button.hidden = !visual || locked || !editor?.isToolEnabled(action ?? '') || !available;
      }
      if (action === 'find-replace') {
        button.hidden = !visual || !editor || editor.disabled || !editor.isToolEnabled('find-replace');
        button.disabled = !editor || editor.disabled;
        button.setAttribute('aria-pressed', String(editor?.findReplaceOpen ?? false));
      }
      if (action === 'focus-mode') {
        button.hidden = !editor || editor.disabled || !editor.isToolEnabled('focus-mode');
        button.disabled = !editor || editor.disabled;
        button.setAttribute('aria-pressed', String(editor?.focusMode ?? false));
        button.innerHTML = toolbarIcon(editor?.focusMode ? 'focus-mode-exit' : 'focus-mode');
        const label = editor?.focusMode ? 'Exit focus mode' : 'Enter focus mode';
        button.setAttribute('aria-label', label); button.title = label;
      }
    }

    this.#blockSelect.disabled = locked;
    for (const option of this.#blockSelect.options) {
      if (option.value === 'mixed') continue;
      const enabled = editor?.isToolEnabled(option.value === 'paragraph' ? 'paragraph' : 'heading') ?? false;
      option.hidden = !enabled;
      option.disabled = !enabled;
    }
    this.#blockSelect.hidden = !visual || locked || !selectionAvailable || !inline
      || (!editor?.isToolEnabled('paragraph') && !editor?.isToolEnabled('heading'));
    const block = editor?.getSelectedBlockStyle();
    this.#blockSelect.value = block === 'mixed' ? 'mixed' : block?.type === 'heading' && block.level && block.level <= 6
      ? `h${block.level}`
      : 'paragraph';

    // Retain one separator only between nonempty groups.
    let precedingControl = false;
    const children = Array.from(this.#toolbar.children) as HTMLElement[];
    children.forEach((child, index) => {
      if (child.getAttribute('part') === 'separator') {
        let followingControl = false;
        for (const next of children.slice(index + 1)) {
          if (next.getAttribute('part') === 'separator') break;
          if (!next.hidden) followingControl = true;
        }
        child.hidden = !precedingControl || !followingControl;
        if (!child.hidden) precedingControl = false;
      } else if (!child.hidden) precedingControl = true;
    });
    this.#toolbar.hidden = !children.some((child) => !child.hidden && child.getAttribute('part') !== 'separator');
    if ((locked || !visual || !editor?.isToolEnabled('link') || !selectionAvailable) && !this.#linkEditor.hidden) this.#closeLinkEditor();
    this.#syncInline();
  }
}

const observedEditorEvents = [
  'transaction',
  'selection-change',
  'reconcile',
  'format-state-change',
  'input',
  'view-change',
  'view-state-change',
  'focus-mode-change',
  'find-replace-change',
] as const;

function editorState(editor: ARichTextElement) {
  return {
    document: editor.getJSON(),
    selection: editor.getSelection(),
  };
}

function pathContainsTable(document: unknown, path: readonly number[]): boolean {
  let node = document as { type?: string; content?: unknown[] };
  for (const index of path) {
    node = node.content?.[index] as typeof node;
    if (!node) return false;
    if (node.type === 'table') return true;
  }
  return false;
}

function safeActiveLink(editor: ARichTextElement): string | null {
  try {
    const link = editor.getActiveMarks().find((mark) => mark.type === 'link');
    return link?.type === 'link' ? link.href : null;
  } catch {
    return null;
  }
}

function safeActiveList(state: ReturnType<typeof editorState>) {
  try {
    return getActiveList(state);
  } catch {
    return null;
  }
}

function safeActiveTable(state: ReturnType<typeof editorState>) {
  try {
    return getActiveTable(state);
  } catch {
    return null;
  }
}

function isMarkAction(value: string | undefined): value is ARichTextSimpleMark {
  return value === 'bold'
    || value === 'italic'
    || value === 'underline'
    || value === 'strike'
    || value === 'code';
}

function isListAction(value: string | undefined): boolean {
  return value === 'bullet-list' || value === 'ordered-list' || value === 'task-list';
}

function isARichTextElement(value: Element | null): value is ARichTextElement {
  if (!value) return false;
  const candidate = value as Partial<ARichTextElement>;
  return typeof candidate.toggleMark === 'function'
    && typeof candidate.getActiveMarks === 'function'
    && typeof candidate.getActiveBlock === 'function'
    && typeof candidate.dispatch === 'function'
    && typeof candidate.getJSON === 'function'
    && typeof candidate.getSelection === 'function'
    && typeof candidate.undo === 'function'
    && typeof candidate.redo === 'function';
}

export function defineARichTextToolbar(tagName = 'a-rich-text-toolbar'): void {
  if (typeof customElements === 'undefined') return;
  if (!customElements.get(tagName)) customElements.define(tagName, tagName === 'a-rich-text-toolbar' ? ARichTextToolbarElement : class extends ARichTextToolbarElement {});
}

defineARichTextToolbar();
defineARichTextToolbar('art-toolbar');

declare global {
  interface HTMLElementTagNameMap {
    'a-rich-text-toolbar': ARichTextToolbarElement;
    'art-toolbar': ARichTextToolbarElement;
  }
}
