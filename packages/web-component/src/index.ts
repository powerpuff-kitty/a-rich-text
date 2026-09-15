import {
  createTextDocument,
  parseDocument,
  serializeDocument,
  toPlainText,
  type ARTDocument,
} from '@arichtext/core';

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
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    [part='editor']:focus-visible {
      outline: 2px solid currentColor;
      outline-offset: 2px;
    }

    :host([disabled]) [part='editor'] {
      cursor: not-allowed;
      opacity: 0.6;
    }

    [part='editor']:empty::before {
      content: attr(data-placeholder);
      opacity: 0.55;
      pointer-events: none;
    }
  </style>
  <div part="editor" role="textbox" aria-multiline="true"></div>
`;

export class ARichTextElement extends HTMLElement {
  static readonly formAssociated = true;
  static readonly observedAttributes = ['disabled', 'readonly', 'placeholder', 'value'];

  #internals: ElementInternals | null;
  #editor: HTMLDivElement;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.append(template.content.cloneNode(true));
    this.#editor = shadow.querySelector<HTMLDivElement>('[part="editor"]')!;
    this.#internals = 'attachInternals' in this ? this.attachInternals() : null;

    this.#editor.addEventListener('input', () => {
      this.#syncFormValue();
      this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    });

    this.#editor.addEventListener('blur', () => {
      this.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  connectedCallback(): void {
    if (!this.#editor.textContent && this.hasAttribute('value')) {
      this.#editor.textContent = this.getAttribute('value') ?? '';
    }
    this.#syncState();
    this.#syncFormValue();
  }

  attributeChangedCallback(): void {
    this.#syncState();
  }

  get value(): string {
    return this.#editor.textContent ?? '';
  }

  set value(value: string) {
    this.#editor.textContent = value;
    this.#syncFormValue();
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
    this.value = '';
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  }

  getText(): string {
    return this.value;
  }

  getJSON(): ARTDocument {
    return createTextDocument(this.value);
  }

  setJSON(document: ARTDocument | string): void {
    const parsed = typeof document === 'string' ? parseDocument(document) : document;
    this.value = toPlainText(parsed);
  }

  serializeJSON(): string {
    return serializeDocument(this.getJSON());
  }

  formResetCallback(): void {
    this.value = this.getAttribute('value') ?? '';
  }

  formDisabledCallback(disabled: boolean): void {
    this.disabled = disabled;
  }

  #syncState(): void {
    const editable = !this.disabled && !this.readOnly;
    this.#editor.contentEditable = editable ? 'true' : 'false';
    this.#editor.setAttribute('aria-disabled', String(this.disabled));
    this.#editor.setAttribute('aria-readonly', String(this.readOnly));
    this.#editor.dataset.placeholder = this.getAttribute('placeholder') ?? '';

    const valueAttribute = this.getAttribute('value');
    if (valueAttribute !== null && valueAttribute !== this.value && !this.#editor.matches(':focus')) {
      this.#editor.textContent = valueAttribute;
      this.#syncFormValue();
    }
  }

  #syncFormValue(): void {
    this.#internals?.setFormValue(this.value);
  }
}

export function defineARichText(tagName = 'a-rich-text'): void {
  if (!customElements.get(tagName)) {
    customElements.define(tagName, ARichTextElement);
  }
}

defineARichText();
