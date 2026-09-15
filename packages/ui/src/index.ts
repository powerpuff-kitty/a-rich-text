import {
  getActiveLinkHref,
  removeSelectionLink,
  setSelectionLink,
} from '@arichtext/links';
import { getActiveList, toggleList, type ListStyle } from '@arichtext/lists';
import {
  addTableColumn,
  addTableRow,
  getActiveTable,
  insertTable,
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
        --art-toolbar-border: color-mix(in srgb, CanvasText 18%, transparent);
        --art-toolbar-active: color-mix(in srgb, CanvasText 12%, transparent);
        --art-toolbar-radius: 0.375rem;
        display: block;
        color: var(--art-toolbar-color);
        font-family: var(--art-toolbar-font);
      }

      [part='toolbar'] {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        box-sizing: border-box;
        width: max-content;
        max-width: 100%;
        padding: 0.25rem;
        border: 1px solid var(--art-toolbar-border);
        border-radius: var(--art-toolbar-radius);
        background: var(--art-toolbar-background);
        overflow-x: auto;
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
        background: var(--art-toolbar-border);
      }

      [part='block-select'] {
        width: auto;
        padding-inline: 0.4rem;
        cursor: pointer;
      }

      [part='link-editor'] {
        display: grid;
        grid-template-columns: minmax(12rem, 1fr) auto auto auto;
        gap: 0.25rem;
        width: min(100%, 36rem);
        margin-top: 0.25rem;
        padding: 0.25rem;
        border: 1px solid var(--art-toolbar-border);
        border-radius: var(--art-toolbar-radius);
        background: var(--art-toolbar-background);
      }

      [part='link-editor'][hidden] { display: none; }

      [part='link-input'] {
        min-width: 0;
        padding-inline: 0.5rem;
        border: 1px solid var(--art-toolbar-border);
      }

      [part='link-error'] {
        grid-column: 1 / -1;
        min-height: 1em;
        font-size: 0.875em;
      }
    </style>
    <div part="toolbar" role="toolbar" aria-label="Text formatting">
      <select part="block-select" aria-label="Text style" data-role="block">
        <option value="paragraph">Paragraph</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
      </select>
      <span part="separator" aria-hidden="true"></span>
      ${MARK_ACTIONS.map(({ action, label, text }) => `
        <button
          part="button ${action}-button"
          type="button"
          data-action="${action}"
          aria-label="${label}"
          title="${label}"
          aria-pressed="false"
        >${text}</button>
      `).join('')}
      <button part="button link-button" type="button" data-action="link" aria-label="Link" title="Link (Ctrl/⌘+K)" aria-pressed="false">↗</button>
      <span part="separator" aria-hidden="true"></span>
      ${LIST_ACTIONS.map(({ action, label, text }) => `
        <button
          part="button ${action}-button"
          type="button"
          data-action="${action}"
          aria-label="${label}"
          title="${label}"
          aria-pressed="false"
        >${text}</button>
      `).join('')}
      <span part="separator" aria-hidden="true"></span>
      <button part="button insert-table-button" type="button" data-action="insert-table" aria-label="Insert table" title="Insert 2 × 2 table">▦</button>
      <button part="button add-row-button" type="button" data-action="add-row" aria-label="Add table row" title="Add row">+R</button>
      <button part="button remove-row-button" type="button" data-action="remove-row" aria-label="Remove table row" title="Remove row">−R</button>
      <button part="button add-column-button" type="button" data-action="add-column" aria-label="Add table column" title="Add column">+C</button>
      <button part="button remove-column-button" type="button" data-action="remove-column" aria-label="Remove table column" title="Remove column">−C</button>
      <span part="separator" aria-hidden="true"></span>
      <button part="button undo-button" type="button" data-action="undo" aria-label="Undo" title="Undo">↶</button>
      <button part="button redo-button" type="button" data-action="redo" aria-label="Redo" title="Redo">↷</button>
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
  static readonly observedAttributes = ['for'];

  #editor: ARichTextElement | null = null;
  #toolbar: HTMLDivElement;
  #blockSelect: HTMLSelectElement;
  #linkEditor: HTMLFormElement;
  #linkInput: HTMLInputElement;
  #linkError: HTMLSpanElement;
  #editorObserver?: MutationObserver;

  constructor() {
    super();
    if (typeof document === 'undefined' || typeof this.attachShadow !== 'function') {
      throw new Error('<a-rich-text-toolbar> can only be instantiated in a browser DOM');
    }

    const shadow = this.attachShadow({ mode: 'open' });
    shadow.append(getTemplate().content.cloneNode(true));
    this.#toolbar = shadow.querySelector<HTMLDivElement>('[part="toolbar"]')!;
    this.#blockSelect = shadow.querySelector<HTMLSelectElement>('[data-role="block"]')!;
    this.#linkEditor = shadow.querySelector<HTMLFormElement>('[data-role="link-editor"]')!;
    this.#linkInput = shadow.querySelector<HTMLInputElement>('[data-role="link-input"]')!;
    this.#linkError = shadow.querySelector<HTMLSpanElement>('[data-role="link-error"]')!;

    shadow.addEventListener('pointerdown', this.#handlePointerDown);
    shadow.addEventListener('click', this.#handleClick);
    this.#blockSelect.addEventListener('change', this.#handleBlockChange);
    this.#linkEditor.addEventListener('submit', this.#handleLinkSubmit);
    this.#linkInput.addEventListener('keydown', this.#handleLinkInputKeyDown);
  }

  connectedCallback(): void {
    this.#resolveEditor();
    this.#refresh();
  }

  disconnectedCallback(): void {
    this.#bindEditor(null);
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (name === 'for' && oldValue !== newValue && this.isConnected) this.#resolveEditor();
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
      for (const eventName of observedEditorEvents) {
        editor.addEventListener(eventName, this.#handleEditorStateChange);
      }
      editor.addEventListener('keydown', this.#handleEditorKeyDown);
      if (typeof MutationObserver !== 'undefined') {
        this.#editorObserver = new MutationObserver(this.#handleEditorStateChange);
        this.#editorObserver.observe(editor, {
          attributes: true,
          attributeFilter: ['disabled', 'readonly'],
        });
      }
      if (editor.id) this.#toolbar.setAttribute('aria-controls', editor.id);
      else this.#toolbar.removeAttribute('aria-controls');
    } else {
      this.#toolbar.removeAttribute('aria-controls');
    }
    this.#refresh();
  }

  #handleEditorStateChange = (): void => {
    this.#refresh();
  };

  #handleEditorKeyDown = (event: Event): void => {
    const keyboard = event as KeyboardEvent;
    if (!this.#editor || this.#editor.disabled || this.#editor.readOnly) return;
    if (!(keyboard.ctrlKey || keyboard.metaKey) || keyboard.altKey || keyboard.shiftKey) return;
    if (keyboard.key.toLowerCase() !== 'k') return;
    if (!hasNonCollapsedSelection(this.#editor)) return;
    keyboard.preventDefault();
    this.#openLinkEditor();
  };

  #handlePointerDown = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    if (target.closest('[data-role="link-editor"]')) return;
    event.preventDefault();
  };

  #handleClick = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;

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
    if (!button || button.disabled || !this.#editor) return;
    const action = button.dataset.action;

    if (isMarkAction(action)) {
      this.#finishEditorAction(this.#editor.toggleMark(action));
      return;
    }
    if (action === 'link') {
      this.#openLinkEditor();
      return;
    }
    if (isListAction(action)) {
      const spec = LIST_ACTIONS.find((candidate) => candidate.action === action)!;
      this.#dispatchCommand(toggleList(editorState(this.#editor), spec.style));
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
      : /^h[1-3]$/.test(value)
        ? this.#editor.setHeading(Number.parseInt(value.slice(1), 10) as 1 | 2 | 3)
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
    if (!this.#editor || !hasNonCollapsedSelection(this.#editor)) return;
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
    if (!this.#editor) return;
    try {
      const command = setSelectionLink(editorState(this.#editor), this.#linkInput.value);
      if (!command) throw new RangeError('Select text before applying a link');
      this.#editor.dispatch(command);
      this.#closeLinkEditor(true);
      this.#refresh();
    } catch (error) {
      this.#linkInput.setAttribute('aria-invalid', 'true');
      this.#linkError.textContent = error instanceof Error ? error.message : 'Invalid link';
      this.#linkInput.focus();
    }
  }

  #removeLink(): void {
    if (!this.#editor) return;
    const command = removeSelectionLink(editorState(this.#editor));
    if (!command) return;
    this.#editor.dispatch(command);
    this.#closeLinkEditor(true);
    this.#refresh();
  }

  #dispatchCommand(command: ReturnType<typeof toggleList>): void {
    if (!this.#editor || !command) return;
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
    const locked = !editor || editor.disabled || editor.readOnly;
    const activeMarks = new Set(editor?.getActiveMarks().map((mark) => mark.type) ?? []);
    const state = editor ? editorState(editor) : null;
    const selectionAvailable = Boolean(editor && hasNonCollapsedSelection(editor));
    const activeLink = editor ? safeActiveLink(editor) : null;
    const activeList = state ? safeActiveList(state) : null;
    const activeTable = state ? safeActiveTable(state) : null;

    for (const button of this.shadowRoot?.querySelectorAll<HTMLButtonElement>('button[data-action]') ?? []) {
      const action = button.dataset.action;
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
      } else if (action === 'insert-table') {
        button.disabled = locked || !state || activeTable !== null;
      } else if (
        action === 'add-row'
        || action === 'remove-row'
        || action === 'add-column'
        || action === 'remove-column'
      ) {
        button.disabled = locked || activeTable === null;
      } else if (action === 'undo') {
        button.disabled = locked || !editor?.canUndo;
      } else if (action === 'redo') {
        button.disabled = locked || !editor?.canRedo;
      }
    }

    this.#blockSelect.disabled = locked;
    const block = editor?.getActiveBlock();
    this.#blockSelect.value = block?.type === 'heading' && block.level && block.level <= 3
      ? `h${block.level}`
      : 'paragraph';

    if (!selectionAvailable && !this.#linkEditor.hidden) this.#closeLinkEditor();
  }
}

const observedEditorEvents = [
  'transaction',
  'selection-change',
  'reconcile',
  'format-state-change',
  'input',
] as const;

function editorState(editor: ARichTextElement) {
  return {
    document: editor.getJSON(),
    selection: editor.getSelection(),
  };
}

function safeActiveLink(editor: ARichTextElement): string | null {
  try {
    return getActiveLinkHref(editorState(editor));
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

function hasNonCollapsedSelection(editor: ARichTextElement): boolean {
  const selection = editor.getSelection();
  if (!selection) return false;
  return selection.anchor.offset !== selection.head.offset
    || selection.anchor.blockPath.length !== selection.head.blockPath.length
    || selection.anchor.blockPath.some((value, index) => value !== selection.head.blockPath[index]);
}

function isMarkAction(value: string | undefined): value is ARichTextSimpleMark {
  return value === 'bold'
    || value === 'italic'
    || value === 'underline'
    || value === 'strike';
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
  if (!customElements.get(tagName)) customElements.define(tagName, ARichTextToolbarElement);
}

defineARichTextToolbar();
