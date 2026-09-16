import type { ARTBlockNode, ARTDocument } from '@arichtext/core';
import { decodeARTPath, encodeARTPath } from '@arichtext/dom';
import { setCodeBlock, removeCodeBlock } from '@arichtext/engine/commands';
import type { ARTSelection } from '@arichtext/engine';
import type { ARichTextElement } from './index.js';

/** A draft editor for atomic code blocks; document changes remain engine transactions. */
export class CodeBlockEditor {
  #host: ARichTextElement;
  #dialog: HTMLDialogElement;
  #code: HTMLTextAreaElement;
  #language: HTMLInputElement;
  #error: HTMLElement;
  #path: number[] | null = null;
  #document = '';
  #selection: ARTSelection | null = null;
  #returnFocus: HTMLElement | null = null;

  constructor(host: ARichTextElement) {
    this.#host = host;
    this.#dialog = host.ownerDocument.createElement('dialog');
    this.#dialog.setAttribute('part', 'code-dialog');
    this.#dialog.setAttribute('aria-labelledby', 'code-title');
    this.#dialog.innerHTML = `
      <form method="dialog">
        <h2 id="code-title">Code block</h2>
        <label>Language (optional)<input data-code-language autocomplete="off" spellcheck="false"></label>
        <label>Code<textarea data-code-text rows="10" spellcheck="false" autocapitalize="off" aria-describedby="code-error"></textarea></label>
        <p id="code-error" role="status"></p>
        <div class="code-actions">
          <button type="submit">Apply code</button>
          <button type="button" data-code-remove>Remove code block</button>
          <button type="button" data-code-cancel>Cancel</button>
        </div>
      </form>`;
    host.shadowRoot!.append(this.#dialog);
    this.#code = this.#dialog.querySelector('textarea')!;
    this.#language = this.#dialog.querySelector('input')!;
    this.#error = this.#dialog.querySelector('#code-error')!;
    this.#dialog.querySelector('form')!.addEventListener('submit', event => {
      event.preventDefault();
      event.stopPropagation();
      this.#apply(false);
    });
    this.#dialog.querySelector('[data-code-remove]')!.addEventListener('click', () => this.#apply(true));
    this.#dialog.querySelector('[data-code-cancel]')!.addEventListener('click', () => this.close());
    this.#dialog.addEventListener('cancel', event => { event.preventDefault(); this.close(); });
    // Draft edits are not canonical editor input/change events.
    for (const type of ['input', 'change']) this.#dialog.addEventListener(type, event => event.stopPropagation());
  }

  get available(): boolean {
    return !this.#host.disabled && !this.#host.readOnly && this.#host.view === 'visual' && this.#host.isToolEnabled('code-block');
  }

  open(path: readonly number[] | null = null): boolean {
    if (!this.available || this.#dialog.open) return false;
    const document = this.#host.getJSON();
    const block = path ? nodeAt(document, path) : null;
    const selection = this.#host.getSelection();
    if (path ? block?.type !== 'codeBlock' : !selection || String(selection.anchor.blockPath) !== String(selection.head.blockPath)) return false;
    this.#path = path ? [...path] : null;
    this.#selection = selection;
    this.#document = JSON.stringify(document);
    this.#code.value = block?.type === 'codeBlock' ? block.text : '';
    this.#language.value = block?.type === 'codeBlock' ? block.language ?? '' : '';
    this.#error.textContent = '';
    this.#dialog.querySelector<HTMLButtonElement>('[data-code-remove]')!.hidden = path === null;
    this.#returnFocus = path
      ? this.#host.shadowRoot!.querySelector<HTMLElement>(`pre[data-art-code-path="${encodeARTPath(path)}"] [data-art-editor-ui]`)
      : this.#host.shadowRoot!.activeElement as HTMLElement | null;
    this.#dialog.showModal();
    this.#code.focus();
    return true;
  }

  close(refocus = true): void {
    if (!this.#dialog.open) return;
    this.#dialog.close();
    if (!refocus) return;
    if (this.#returnFocus?.isConnected) this.#returnFocus.focus();
    else this.#host.focus({ preventScroll: true });
  }

  sync(): void {
    if (!this.available) this.close(false);
    for (const pre of this.#host.shadowRoot!.querySelectorAll<HTMLElement>('pre[data-art-code-path]')) {
      pre.contentEditable = 'false';
      let button = pre.querySelector<HTMLButtonElement>('[data-art-editor-ui]');
      if (!button) {
        button = this.#host.ownerDocument.createElement('button');
        button.type = 'button';
        button.textContent = 'Edit code block';
        button.setAttribute('data-art-editor-ui', '');
        button.setAttribute('part', 'code-edit-button');
        button.addEventListener('click', () => this.open(decodeARTPath(pre.getAttribute('data-art-code-path')!)));
        pre.append(button);
      }
      button.hidden = !this.available;
    }
  }

  #apply(remove: boolean): void {
    if (!this.available) { this.close(false); return; }
    if (JSON.stringify(this.#host.getJSON()) !== this.#document) {
      this.#error.textContent = 'The document changed while you were editing. Copy your draft, cancel, and reopen the code block.';
      return;
    }
    if (!remove && !/^[a-zA-Z0-9_+.#-]*$/.test(this.#language.value.trim())) {
      this.#error.textContent = 'Use a language name such as javascript, c++ or c# without spaces or backticks.';
      this.#language.focus();
      return;
    }
    try {
      const state = { document: this.#host.getJSON(), selection: this.#selection };
      const command = remove && this.#path ? removeCodeBlock(state, this.#path)
        : setCodeBlock(state, this.#path, this.#code.value, this.#language.value.trim());
      if (!command) throw new Error('The code block can no longer be edited at this location.');
      this.#host.dispatch(command);
      this.close(false);
      this.#host.focus({ preventScroll: true });
    } catch (error) {
      this.#error.textContent = error instanceof Error ? error.message : 'Unable to apply code.';
    }
  }
}

function nodeAt(document: ARTDocument, path: readonly number[]): ARTBlockNode | null {
  let node: unknown = document;
  for (const index of path) {
    if (!node || typeof node !== 'object' || !('content' in node) || !Array.isArray(node.content)) return null;
    node = node.content[index];
  }
  return node as ARTBlockNode | null;
}
