import type { ARichTextElement } from './index.js';

/** Keep the form-associated host in place while presenting its existing controls. */
export class FocusMode {
  #host: ARichTextElement;
  #dialog: HTMLDialogElement;
  #content: HTMLElement;
  #controls: Array<{ node: HTMLElement; anchor: Comment }> = [];
  #toolbars = new Map<HTMLElement, { anchor: Comment; slot: string | null } | null>();
  #returnFocus: HTMLElement | null = null;
  #beforeClose: () => void;

  constructor(host: ARichTextElement, beforeClose: () => void) {
    this.#host = host;
    this.#beforeClose = beforeClose;
    this.#dialog = host.ownerDocument.createElement('dialog');
    this.#dialog.setAttribute('part', 'focus-dialog');
    this.#dialog.setAttribute('aria-label', 'Editor focus mode');
    this.#dialog.innerHTML = `<div part="focus-header"><strong>Focus mode</strong><button part="focus-exit-button" type="button">Exit focus mode</button></div>
      <slot name="focus-toolbar" part="focus-toolbar"></slot><div part="focus-content"></div>`;
    this.#content = this.#dialog.querySelector('[part="focus-content"]')!;
    this.#dialog.querySelector('button')!.addEventListener('click', () => this.close());
    this.#dialog.addEventListener('cancel', event => { event.preventDefault(); this.close(); });
    this.#dialog.addEventListener('close', () => { if (!this.active && this.#controls.length) this.close(); });
    host.shadowRoot!.append(this.#dialog);
  }

  get active(): boolean { return this.#dialog.open; }

  registerToolbar(toolbar: HTMLElement): () => void {
    if (this.#toolbars.has(toolbar)) return () => {};
    this.#toolbars.set(toolbar, null);
    if (this.active) this.#moveToolbar(toolbar);
    return () => { this.#restoreToolbar(toolbar); this.#toolbars.delete(toolbar); };
  }

  #moveToolbar(toolbar: HTMLElement): void {
    if (this.#toolbars.get(toolbar) || !toolbar.parentNode || toolbar === this.#host || toolbar.contains(this.#host)) return;
    if (toolbar.parentNode === this.#host && toolbar.slot === 'focus-toolbar') return;
    const anchor = this.#host.ownerDocument.createComment('focus toolbar position');
    toolbar.before(anchor);
    this.#toolbars.set(toolbar, { anchor, slot: toolbar.getAttribute('slot') });
    toolbar.slot = 'focus-toolbar';
    this.#host.append(toolbar);
  }

  #restoreToolbar(toolbar: HTMLElement): void {
    const position = this.#toolbars.get(toolbar);
    if (!position) return;
    this.#toolbars.set(toolbar, null);
    // Do not resurrect a toolbar the application has explicitly removed/reparented.
    if (toolbar.parentNode === this.#host) {
      if (position.slot === null) toolbar.removeAttribute('slot'); else toolbar.setAttribute('slot', position.slot);
      if (position.anchor.parentNode) position.anchor.replaceWith(toolbar);
    }
    position.anchor.remove();
  }

  open(): boolean {
    if (this.active) return true;
    if (!this.#host.isConnected || this.#host.disabled || !this.#host.isToolEnabled('focus-mode')
      || this.#host.shadowRoot!.querySelector('dialog[open]') || typeof this.#dialog.showModal !== 'function') return false;
    let active = this.#host.ownerDocument.activeElement;
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
    this.#returnFocus = active instanceof HTMLElement && active !== this.#host.ownerDocument.body ? active : null;
    const source = this.#host.shadowRoot!.querySelector<HTMLTextAreaElement>('[part="source"]')!;
    const range = [source.selectionStart, source.selectionEnd, source.selectionDirection] as const;
    for (const part of ['view-switcher', 'editor', 'source-panel']) {
      const node = this.#host.shadowRoot!.querySelector<HTMLElement>(`[part="${part}"]`)!;
      const anchor = this.#host.ownerDocument.createComment('focus control position');
      node.before(anchor); this.#controls.push({ node, anchor }); this.#content.append(node);
    }
    for (const toolbar of this.#toolbars.keys()) this.#moveToolbar(toolbar);
    this.#dialog.showModal();
    this.#emit();
    this.#host.focus({ preventScroll: true });
    if (this.#host.view !== 'visual') source.setSelectionRange(...range);
    return true;
  }

  close(refocus = true): void {
    if (!this.active && !this.#controls.length) return;
    this.#beforeClose();
    const controls = this.#controls; this.#controls = [];
    this.#dialog.close();
    for (const { node, anchor } of controls) anchor.replaceWith(node);
    for (const toolbar of this.#toolbars.keys()) this.#restoreToolbar(toolbar);
    this.#emit();
    if (refocus && this.#host.isConnected && !this.#host.disabled) {
      if (this.#returnFocus?.isConnected && this.#returnFocus !== this.#host.shadowRoot!.querySelector('[part="editor"]')) this.#returnFocus.focus({ preventScroll: true });
      else this.#host.focus({ preventScroll: true });
    }
  }

  sync(): void {
    if (this.#host.disabled || !this.#host.isToolEnabled('focus-mode')) this.close(false);
  }

  #emit(): void {
    this.#host.dispatchEvent(new CustomEvent('focus-mode-change', { bubbles: true, composed: true, detail: { active: this.active } }));
  }
}
