const Base = (typeof HTMLElement === 'undefined' ? class {} : HTMLElement) as typeof HTMLElement;
/** Shared chrome for a toolbar and editor. Content itself has no border. */
export class ARichTextShellElement extends Base {
  #observer?: MutationObserver;
  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).innerHTML = `<style>
      :host { display:block; overflow:clip; box-sizing:border-box; min-width:0; max-width:var(--art-shell-max-width,100%); margin-inline:auto; border:var(--art-shell-border,1px solid #d5dbe5); border-radius:var(--art-shell-radius,10px); background:var(--art-shell-background,Canvas); color:CanvasText; box-shadow:var(--art-shell-shadow,none); }
      :host(:focus-within) { outline:2px solid color-mix(in srgb,Highlight 40%,transparent); outline-offset:2px; }
      ::slotted(a-rich-text-toolbar) { --art-toolbar-background:#f5f7fa; --art-toolbar-radius:0; --art-toolbar-max-width:100%; --art-toolbar-padding:.5rem; border-bottom:1px solid #d5dbe5; border-radius:inherit; }
      ::slotted(a-rich-text) { --art-max-width:100%; --art-editor-focus-outline:none; margin:0; }
      :host([data-preset=minimal]) { border:var(--art-shell-border,0); border-bottom:1px solid #d5dbe5; border-radius:var(--art-shell-radius,0); }
      :host([data-preset=minimal]) ::slotted(a-rich-text-toolbar) { --art-toolbar-background:transparent; --art-toolbar-padding:.2rem 0; border-bottom:0; }
      :host([data-preset=document]) { max-width:var(--art-shell-max-width,52rem); border-radius:var(--art-shell-radius,3px); box-shadow:var(--art-shell-shadow,0 12px 40px #18284614); }
      :host([data-preset=document]) ::slotted(a-rich-text-toolbar) { --art-toolbar-background:#faf9f6; --art-toolbar-padding:.7rem; }
      @media (prefers-color-scheme:dark) { ::slotted(a-rich-text-toolbar) { --art-toolbar-background:color-mix(in srgb,CanvasText 6%,Canvas); } }
    </style><slot></slot>`;
  }
  connectedCallback(): void {
    this.#observer = new MutationObserver(this.#sync);
    this.#observer.observe(this, { childList: true, subtree: true, attributes: true, attributeFilter: ['preset'] });
    this.#sync();
  }
  disconnectedCallback(): void { this.#observer?.disconnect(); }
  #sync = (): void => { this.dataset.preset = this.querySelector('a-rich-text')?.getAttribute('preset') ?? 'default'; };
}
if (typeof customElements !== 'undefined' && !customElements.get('a-rich-text-shell')) customElements.define('a-rich-text-shell', ARichTextShellElement);
