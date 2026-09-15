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
      [part='block-select'] {
        min-width: 2rem;
        min-height: 2rem;
        box-sizing: border-box;
        border: 0;
        border-radius: calc(var(--art-toolbar-radius) * 0.75);
        background: transparent;
        color: inherit;
        font: inherit;
      }

      [part~='button'] {
        display: inline-grid;
        place-items: center;
        padding: 0 0.5rem;
        cursor: pointer;
      }

      [part~='button'][aria-pressed='true'] {
        background: var(--art-toolbar-active);
      }

      [part~='button']:focus-visible,
      [part='block-select']:focus-visible {
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
      <span part="separator" aria-hidden="true"></span>
      <button part="button undo-button" type="button" data-action="undo" aria-label="Undo" title="Undo">↶</button>
      <button part="button redo-button" type="button" data-action="redo" aria-label="Redo" title="Redo">↷</button>
    </div>
  `;
  cachedTemplate = template;
  return template;
}

export class ARichTextToolbarElement extends HTMLElementBase {
  static readonly observedAttributes = ['for'];

  #editor: ARichTextElement | null = null;
  #toolbar: HTMLDivElement;
  #blockSelect: HTMLSelectElement;
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

    shadow.addEventListener('pointerdown', this.#handlePointerDown);
    shadow.addEventListener('click', this.#handleClick);
    this.#blockSelect.addEventListener('change', this.#handleBlockChange);
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
    }
    this.#editorObserver?.disconnect();
    this.#editorObserver = undefined;

    this.#editor = editor;
    if (editor) {
      for (const eventName of observedEditorEvents) {
        editor.addEventListener(eventName, this.#handleEditorStateChange);
      }
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

  #handlePointerDown = (event: Event): void => {
    const target = event.target;
    if (target instanceof HTMLButtonElement) event.preventDefault();
  };

  #handleClick = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>('button[data-action]');
    if (!button || button.disabled || !this.#editor) return;

    const action = button.dataset.action;
    let handled = false;
    if (isMarkAction(action)) handled = this.#editor.toggleMark(action);
    else if (action === 'undo') handled = this.#editor.undo();
    else if (action === 'redo') handled = this.#editor.redo();

    if (handled) this.#editor.focus({ preventScroll: true });
    this.#refresh();
  };

  #handleBlockChange = (): void => {
    if (!this.#editor || this.#blockSelect.disabled) return;
    const value = this.#blockSelect.value;
    const handled = value === 'paragraph'
      ? this.#editor.setParagraph()
      : /^h[1-3]$/.test(value)
        ? this.#editor.setHeading(Number.parseInt(value.slice(1), 10) as 1 | 2 | 3)
        : false;
    if (handled) this.#editor.focus({ preventScroll: true });
    this.#refresh();
  };

  #refresh(): void {
    const editor = this.#editor;
    const locked = !editor || editor.disabled || editor.readOnly;
    const activeMarks = new Set(editor?.getActiveMarks().map((mark) => mark.type) ?? []);

    for (const button of this.shadowRoot?.querySelectorAll<HTMLButtonElement>('button[data-action]') ?? []) {
      const action = button.dataset.action;
      if (isMarkAction(action)) {
        button.disabled = locked;
        button.setAttribute('aria-pressed', String(activeMarks.has(action)));
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
  }
}

const observedEditorEvents = [
  'transaction',
  'selection-change',
  'reconcile',
  'format-state-change',
  'input',
] as const;

function isMarkAction(value: string | undefined): value is ARichTextSimpleMark {
  return value === 'bold'
    || value === 'italic'
    || value === 'underline'
    || value === 'strike';
}

function isARichTextElement(value: Element | null): value is ARichTextElement {
  if (!value) return false;
  const candidate = value as Partial<ARichTextElement>;
  return typeof candidate.toggleMark === 'function'
    && typeof candidate.getActiveMarks === 'function'
    && typeof candidate.getActiveBlock === 'function'
    && typeof candidate.undo === 'function'
    && typeof candidate.redo === 'function';
}

export function defineARichTextToolbar(tagName = 'a-rich-text-toolbar'): void {
  if (typeof customElements === 'undefined') return;
  if (!customElements.get(tagName)) customElements.define(tagName, ARichTextToolbarElement);
}

defineARichTextToolbar();
