const Base = (typeof HTMLElement === 'undefined' ? class {} : HTMLElement) as typeof HTMLElement;

/** Small, dependency-free select with a top-layer, viewport-clamped listbox. */
export class ARichTextSelectElement extends Base {
  static observedAttributes = ['value', 'disabled', 'label', 'aria-label'];
  #button: HTMLButtonElement;
  #menu: HTMLElement;
  #observer?: MutationObserver;
  #open = false;
  #search = '';
  #searchAt = 0;
  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>
      :host { display:inline-block; font:inherit; color:inherit; max-width:100%; }
      :host([hidden]) { display:none; }
      button { font:inherit; color:inherit; cursor:pointer; }
      [part=trigger] { display:flex; align-items:center; gap:.7em; justify-content:space-between; min-height:2.25rem; max-width:100%; padding:.35rem .6rem; border:0; border-radius:5px; background:transparent; }
      [part=trigger]:hover { background:color-mix(in srgb,currentColor 7%,transparent); }
      [part=trigger]:focus-visible, [role=option]:focus-visible { outline:2px solid Highlight; outline-offset:-2px; }
      button:disabled { opacity:.5; cursor:default; }
      [part=menu] { position:fixed; inset:auto; margin:0; padding:5px; box-sizing:border-box; background:Canvas; color:CanvasText; border:1px solid color-mix(in srgb,CanvasText 20%,transparent); border-radius:8px; box-shadow:0 8px 32px #0003; overflow:auto; z-index:10000; font:14px/1.4 system-ui,sans-serif; }
      [part=menu][hidden] { display:none; }
      [role=option] { display:block; width:100%; min-height:34px; padding:6px 10px; text-align:start; border:0; border-radius:4px; background:transparent; }
      [role=option]:hover, [role=option][aria-selected=true] { background:color-mix(in srgb,Highlight 15%,Canvas); }
    </style><button part="trigger" type="button" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-controls="options"><span></span><span aria-hidden="true">⌄</span></button><div part="menu" id="options" role="listbox" popover="manual" hidden></div>`;
    this.#button = root.querySelector('button')!;
    this.#menu = root.querySelector('[part=menu]')!;
    this.#button.addEventListener('click', () => this.#open ? this.close() : this.open());
    root.addEventListener('keydown', event => this.#key(event as KeyboardEvent));
    this.#menu.addEventListener('click', event => {
      const option = (event.target as Element).closest<HTMLButtonElement>('[data-value]');
      if (option && !option.disabled) this.#choose(option.dataset.value!);
    });
    // A control edit is not an editor content change.
    root.addEventListener('input', event => event.stopPropagation());
  }
  get options(): HTMLOptionElement[] { return Array.from(this.querySelectorAll('option')); }
  get value(): string { return this.getAttribute('value') ?? this.options.find(option => !option.hidden)?.value ?? ''; }
  set value(value: string) { if (this.getAttribute('value') !== value) this.setAttribute('value', value); }
  get disabled(): boolean { return this.hasAttribute('disabled'); }
  set disabled(value: boolean) { if (this.disabled !== value) this.toggleAttribute('disabled', value); }
  get opened(): boolean { return this.#open; }
  connectedCallback(): void {
    this.#observer = new MutationObserver(() => this.#render());
    this.#observer.observe(this, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'disabled', 'value'] });
    this.#render();
  }
  disconnectedCallback(): void { this.close(false); this.#observer?.disconnect(); }
  attributeChangedCallback(): void { if (this.#button) this.#render(); }
  #render(): void {
    const label = this.getAttribute('label') ?? this.getAttribute('aria-label') ?? 'Choose an option';
    this.#button.setAttribute('aria-label', label);
    this.#menu.setAttribute('aria-label', label);
    this.#button.disabled = this.disabled;
    this.#button.querySelector('span')!.textContent = this.options.find(option => option.value === this.value)?.textContent ?? this.value;
    const focused = this.#open ? this.shadowRoot?.activeElement?.getAttribute('data-value') : null;
    this.#menu.replaceChildren(...this.options.filter(option => !option.hidden).map(option => {
      const button = this.ownerDocument.createElement('button');
      button.type = 'button'; button.setAttribute('role', 'option'); button.dataset.value = option.value;
      button.textContent = option.textContent; button.disabled = option.disabled;
      button.setAttribute('aria-selected', String(option.value === this.value));
      button.tabIndex = -1; return button;
    }));
    if (this.disabled || this.hidden) this.close(false);
    if (this.#open) {
      this.#place();
      if (focused !== null && focused !== undefined) this.#items().find(item => item.dataset.value === focused)?.focus({ preventScroll: true });
    }
  }
  #items(): HTMLButtonElement[] { return Array.from(this.#menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')); }
  open(): void {
    if (this.disabled || this.hidden || !this.isConnected || !this.#items().length) return;
    this.#open = true; this.#menu.hidden = false;
    this.#button.setAttribute('aria-expanded', 'true');
    if (typeof this.#menu.showPopover === 'function' && !this.#menu.matches(':popover-open')) this.#menu.showPopover();
    this.#place();
    const items = this.#items(); (items.find(item => item.dataset.value === this.value) ?? items[0])?.focus({ preventScroll: true });
    this.ownerDocument.addEventListener('pointerdown', this.#outside, true);
    this.ownerDocument.addEventListener('scroll', this.#place, true);
    this.ownerDocument.defaultView?.addEventListener('resize', this.#place);
    this.ownerDocument.defaultView?.visualViewport?.addEventListener('resize', this.#place);
    this.ownerDocument.defaultView?.visualViewport?.addEventListener('scroll', this.#place);
  }
  close(refocus = true): void {
    const wasOpen = this.#open;
    this.#open = false;
    if (typeof this.#menu.hidePopover === 'function' && this.#menu.matches(':popover-open')) this.#menu.hidePopover();
    this.#menu.hidden = true; this.#button.setAttribute('aria-expanded', 'false');
    this.ownerDocument.removeEventListener('pointerdown', this.#outside, true);
    this.ownerDocument.removeEventListener('scroll', this.#place, true);
    this.ownerDocument.defaultView?.removeEventListener('resize', this.#place);
    this.ownerDocument.defaultView?.visualViewport?.removeEventListener('resize', this.#place);
    this.ownerDocument.defaultView?.visualViewport?.removeEventListener('scroll', this.#place);
    if (wasOpen && refocus && this.isConnected) this.#button.focus({ preventScroll: true });
  }
  #outside = (event: Event): void => { if (!event.composedPath().includes(this)) this.close(false); };
  #place = (): void => {
    if (!this.#open) return;
    const win = this.ownerDocument.defaultView!;
    const viewport = win.visualViewport;
    const left = viewport?.offsetLeft ?? 0, top = viewport?.offsetTop ?? 0;
    const width = viewport?.width ?? win.innerWidth, height = viewport?.height ?? win.innerHeight;
    const rect = this.#button.getBoundingClientRect();
    if (rect.bottom < top || rect.top > top + height || rect.right < left || rect.left > left + width) { this.close(false); return; }
    const menuWidth = Math.max(0, Math.min(Math.max(rect.width, 210), width - 16));
    this.#menu.style.width = `${menuWidth}px`;
    const below = Math.max(0, top + height - rect.bottom - 12), above = Math.max(0, rect.top - top - 12);
    const up = below < Math.min(this.#menu.scrollHeight, 280) && above > below;
    this.#menu.style.maxHeight = `${Math.min(320, up ? above : below)}px`;
    const menuHeight = this.#menu.getBoundingClientRect().height;
    const x = win.getComputedStyle(this).direction === 'rtl' ? rect.right - menuWidth : rect.left;
    this.#menu.style.left = `${Math.max(left + 8, Math.min(x, left + width - menuWidth - 8))}px`;
    this.#menu.style.top = `${Math.max(top + 8, up ? rect.top - menuHeight - 4 : rect.bottom + 4)}px`;
    this.#menu.dataset.placement = up ? 'above' : 'below';
  };
  #choose(value: string): void {
    this.value = value; this.close();
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }
  #key = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this.#open) { event.preventDefault(); event.stopPropagation(); this.close(); return; }
    if (event.key === 'Tab') { if (this.#open) this.#button.focus({ preventScroll: true }); this.close(false); return; }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      if (!this.#open) {
        this.open();
        if (event.key === 'Home') this.#items()[0]?.focus({ preventScroll: true });
        if (event.key === 'End') this.#items().at(-1)?.focus({ preventScroll: true });
        return;
      }
      const items = this.#items(), index = items.indexOf(this.shadowRoot!.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next]?.focus({ preventScroll: true }); items[next]?.scrollIntoView({ block: 'nearest' });
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && event.key !== ' ') {
      event.preventDefault(); if (!this.#open) this.open();
      this.#search = Date.now() - this.#searchAt > 700 ? event.key : this.#search + event.key; this.#searchAt = Date.now();
      this.#items().find(item => item.textContent?.toLowerCase().startsWith(this.#search.toLowerCase()))?.focus({ preventScroll: true });
    }
  };
}
export function defineARichTextSelect(tagName = 'a-rich-text-select'): void {
  if (typeof customElements !== 'undefined' && !customElements.get(tagName)) customElements.define(tagName, tagName === 'a-rich-text-select' ? ARichTextSelectElement : class extends ARichTextSelectElement {});
}
defineARichTextSelect();
defineARichTextSelect('art-select');

declare global {
  interface HTMLElementTagNameMap {
    'a-rich-text-select': ARichTextSelectElement;
    'art-select': ARichTextSelectElement;
  }
}
