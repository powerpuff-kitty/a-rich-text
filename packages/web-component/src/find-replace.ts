import { createDOMTextRange } from '@arichtext/dom';
import { findText, replaceSearchMatches, transaction, type ARTSearchMatch, type ARTSearchOptions } from '@arichtext/engine';
import type { ARichTextElement } from './index.js';

export class FindReplace {
  #host: ARichTextElement;
  #panel: HTMLElement;
  #editor: HTMLElement;
  #matches: ARTSearchMatch[] = [];
  #index = 0;
  #observer?: ResizeObserver;
  #composing = false;

  constructor(host: ARichTextElement) {
    this.#host = host;
    this.#editor = host.shadowRoot!.querySelector('[part="editor"]')!;
    this.#panel = host.ownerDocument.createElement('section');
    this.#panel.setAttribute('part', 'find-panel'); this.#panel.setAttribute('role', 'search');
    this.#panel.setAttribute('aria-label', 'Find and replace'); this.#panel.hidden = true;
    this.#panel.innerHTML = `<div class="find-row">
      <label>Find text<input part="find-input" data-find="query" type="text" autocomplete="off" spellcheck="false"></label>
      <div class="find-actions"><button part="find-previous-button" type="button" data-find-action="previous" aria-label="Previous match">Previous</button>
      <button part="find-next-button" type="button" data-find-action="next" aria-label="Next match">Next</button>
      <button part="find-close-button" type="button" data-find-action="close" aria-label="Close find">Close</button></div>
    </div><div class="find-options">
      <label><input part="find-case" data-find="case" type="checkbox">Match case</label>
      <label><input part="find-whole-word" data-find="word" type="checkbox">Whole words</label>
    </div><div class="find-row" data-find-replace>
      <label>Replace with<input part="find-replacement" data-find="replacement" type="text" autocomplete="off" spellcheck="false"></label>
      <div class="find-actions"><button part="find-replace-button" type="button" data-find-action="replace" aria-label="Replace match">Replace</button>
      <button part="find-replace-all-button" type="button" data-find-action="all">Replace all</button></div>
    </div><p part="find-status" role="status" aria-live="polite"></p>
    <p part="find-note">Searches body text. Code blocks and image details use their own editors.</p>`;
    host.shadowRoot!.querySelector('[part="view-switcher"]')!.before(this.#panel);
    this.#panel.addEventListener('input', event => {
      event.stopPropagation();
      if (event.target === this.#input('query')) { this.#index = 0; this.refresh(); this.#select(); }
    });
    this.#panel.addEventListener('change', event => {
      event.stopPropagation();
      if (event.target === this.#input('case') || event.target === this.#input('word')) {
        this.#index = 0; this.refresh(); this.#select();
      }
    });
    this.#panel.addEventListener('click', event => {
      const action = (event.target as Element).closest<HTMLElement>('[data-find-action]')?.dataset.findAction;
      if (action === 'close') this.close();
      else if (action === 'previous' || action === 'next') this.#navigate(action === 'next' ? 1 : -1);
      else if (action === 'replace' || action === 'all') this.#replace(action === 'all');
    });
    host.shadowRoot!.addEventListener('keydown', event => this.#keyDown(event as KeyboardEvent));
    this.#editor.addEventListener('compositionstart', () => { this.#composing = true; this.#clearHighlight(); this.#controls(); });
    this.#editor.addEventListener('compositionend', () => { this.#composing = false; this.refresh(); });
  }

  get active(): boolean { return !this.#panel.hidden; }
  get available(): boolean { return this.#host.isConnected && !this.#host.disabled && this.#host.view === 'visual' && this.#host.isToolEnabled('find-replace'); }
  #input(name: string): HTMLInputElement { return this.#panel.querySelector(`[data-find="${name}"]`)!; }
  #options(): ARTSearchOptions { return { matchCase: this.#input('case').checked, wholeWord: this.#input('word').checked }; }

  open(query?: string): boolean {
    if (!this.available || this.#composing || this.#host.shadowRoot!.querySelector('dialog[open]:not([part="focus-dialog"])')) return false;
    const wasOpen = this.active;
    this.#panel.hidden = false;
    if (query !== undefined) { this.#input('query').value = query; this.#index = 0; }
    if (!this.#observer && typeof ResizeObserver !== 'undefined') {
      this.#observer = new ResizeObserver(() => this.#drawHighlight()); this.#observer.observe(this.#editor);
    }
    this.refresh(); this.#input('query').focus(); this.#input('query').select(); this.#select();
    if (!wasOpen) this.#emit();
    return true;
  }

  close(refocus = true, clear = false): void {
    const wasOpen = this.active;
    if (wasOpen && refocus && this.available && !this.#composing) this.#select();
    this.#panel.hidden = true; this.#observer?.disconnect(); this.#observer = undefined; this.#clearHighlight();
    if (clear) { this.#composing = false; this.#input('query').value = ''; this.#input('replacement').value = ''; this.#matches = []; this.#index = 0; }
    if (wasOpen) {
      this.#emit();
      if (refocus && this.#host.isConnected && !this.#host.disabled) this.#host.focus({ preventScroll: true });
    }
  }

  refresh(): void {
    if (!this.active) return;
    if (!this.available) { this.close(false); return; }
    this.#matches = findText(this.#host.getJSON(), this.#input('query').value, this.#options());
    this.#index = Math.max(0, Math.min(this.#index, this.#matches.length - 1));
    this.#controls(); this.#drawHighlight();
  }

  #controls(): void {
    this.#panel.querySelector<HTMLElement>('[data-find-replace]')!.hidden = this.#host.readOnly;
    for (const button of this.#panel.querySelectorAll<HTMLButtonElement>('[data-find-action]')) {
      const action = button.dataset.findAction;
      button.disabled = action !== 'close' && (this.#matches.length === 0 || this.#composing
        || ((action === 'replace' || action === 'all') && this.#host.readOnly));
    }
    this.#panel.querySelector('[part="find-status"]')!.textContent = !this.#input('query').value ? 'Enter text to find.'
      : this.#matches.length ? `${this.#index + 1} of ${this.#matches.length} matches` : 'No matches.';
  }

  #navigate(direction: number): void {
    this.refresh();
    if (!this.#matches.length || this.#composing) return;
    this.#index = (this.#index + direction + this.#matches.length) % this.#matches.length;
    this.#controls(); this.#select();
  }

  #select(): void {
    const match = this.#matches[this.#index];
    if (!match || this.#composing) { this.#clearHighlight(); return; }
    this.#host.dispatch(transaction().setSelection(match.selection).setMeta('command', 'findMatch').build());
    this.#drawHighlight();
    this.#editor.querySelector<HTMLElement>('[data-art-find-highlight]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }

  #replace(all: boolean): void {
    if (!this.available || this.#host.readOnly || this.#composing) return;
    this.refresh();
    const previous = this.#matches[this.#index];
    if (!previous) return;
    const replacement = this.#input('replacement').value;
    const tx = replaceSearchMatches({ document: this.#host.getJSON(), selection: this.#host.getSelection() },
      this.#input('query').value, replacement, this.#options(), all ? undefined : this.#index);
    if (tx) this.#host.dispatch(tx);
    this.refresh();
    if (!all) {
      const start = previous.selection.anchor;
      const next = this.#matches.findIndex(match => {
        const point = match.selection.anchor;
        for (let i = 0; i < Math.max(point.blockPath.length, start.blockPath.length); i++) {
          const difference = (point.blockPath[i] ?? -1) - (start.blockPath[i] ?? -1);
          if (difference) return difference > 0;
        }
        return point.offset >= start.offset + replacement.length;
      });
      this.#index = Math.max(0, next);
    }
    this.#controls(); this.#select();
  }

  #clearHighlight(): void { this.#editor.querySelectorAll('[data-art-find-highlight]').forEach(node => node.remove()); }
  #drawHighlight(): void {
    this.#clearHighlight();
    const match = this.#matches[this.#index];
    if (!this.active || !match || this.#composing) return;
    const range = createDOMTextRange(this.#editor, match.selection.anchor, match.selection.head);
    if (!range || typeof range.getClientRects !== 'function') return;
    const bounds = this.#editor.getBoundingClientRect();
    const seen = new Set<string>();
    for (const rect of Array.from(range.getClientRects())) {
      const key = [rect.left, rect.top, rect.width, rect.height].join();
      if (seen.has(key)) continue;
      seen.add(key);
      if (!rect.width || !rect.height) continue;
      const highlight = this.#host.ownerDocument.createElement('span');
      highlight.setAttribute('part', 'find-highlight'); highlight.setAttribute('data-art-find-highlight', '');
      highlight.setAttribute('data-art-editor-ui', ''); highlight.setAttribute('aria-hidden', 'true'); highlight.contentEditable = 'false';
      Object.assign(highlight.style, {
        left: `${rect.left - bounds.left + this.#editor.scrollLeft - this.#editor.clientLeft}px`,
        top: `${rect.top - bounds.top + this.#editor.scrollTop - this.#editor.clientTop}px`,
        width: `${rect.width}px`, height: `${rect.height}px`, scrollMarginTop: `${this.#panel.offsetHeight + 16}px`,
      });
      this.#editor.append(highlight);
    }
  }

  #keyDown(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.isComposing || this.#composing || event.altKey) return;
    if (this.#host.shadowRoot!.querySelector('dialog[open]:not([part="focus-dialog"])')) return;
    const insidePanel = event.composedPath().includes(this.#panel);
    const insideEditor = event.composedPath().includes(this.#editor);
    if (!insidePanel && !insideEditor) return;
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'f') {
      if (this.open()) { event.preventDefault(); event.stopPropagation(); }
    } else if (this.active && event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); this.close();
    } else if (insidePanel && event.key === 'Enter' && event.target instanceof HTMLInputElement) {
      event.preventDefault(); event.stopPropagation();
      if (event.target === this.#input('replacement')) this.#replace(false); else this.#navigate(event.shiftKey ? -1 : 1);
    }
  }

  #emit(): void {
    this.#host.dispatchEvent(new CustomEvent('find-replace-change', { bubbles: true, composed: true, detail: { open: this.active } }));
  }
}
