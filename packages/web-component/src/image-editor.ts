import type { ARTBlockNode, ARTDocument, ARTImageNode } from '@arichtext/core';
import { decodeARTPath, encodeARTPath } from '@arichtext/dom';
import { isSafeImageSource, setImageBlock, removeImageBlock } from '@arichtext/engine/commands';
import type { ARTSelection } from '@arichtext/engine';
import type { ARichTextElement } from './index.js';

export interface ARichTextImageUploadContext {
  signal: AbortSignal;
  onProgress(progress: { loaded: number; total?: number }): void;
}
export type ARichTextImageUploader = (file: File, context: ARichTextImageUploadContext) => Promise<{
  src: string; width?: number; height?: number;
}>;

/** Draft image authoring. Upload transport and image processing belong to the host. */
export class ImageEditor {
  #host: ARichTextElement;
  #dialog: HTMLDialogElement;
  #error: HTMLElement;
  #preview: HTMLImageElement;
  #path: number[] | null = null;
  #document = '';
  #selection: ARTSelection | null = null;
  #returnFocus: HTMLElement | null = null;
  #file: File | null = null;
  #previewURL: string | null = null;
  #pending: AbortController | null = null;
  #uploader?: ARichTextImageUploader;

  constructor(host: ARichTextElement) {
    this.#host = host;
    this.#dialog = host.ownerDocument.createElement('dialog');
    this.#dialog.setAttribute('part', 'image-dialog');
    this.#dialog.setAttribute('aria-labelledby', 'image-title');
    this.#dialog.innerHTML = `<form part="image-form" method="dialog" novalidate>
      <h2 id="image-title">Image</h2>
      <label>Image URL<input part="image-source" data-image="src" type="text" required aria-describedby="image-error"></label>
      <section data-image-upload hidden>
        <label>Choose image file<input part="image-file" data-image="file" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif"></label>
        <button part="image-upload-button" type="button" data-image-action="upload">Upload image</button>
        <button part="image-upload-cancel-button" type="button" data-image-action="stop" hidden>Cancel upload</button>
        <p part="image-progress" role="status" data-image-progress></p>
      </section>
      <label>Alternative text<input part="image-alt" data-image="alt" type="text" required></label>
      <label class="image-choice"><input part="image-decorative" data-image="decorative" type="checkbox">Decorative image</label>
      <label>Title (optional)<input part="image-title" data-image="title" type="text"></label>
      <div class="image-dimensions">
        <label>Width (pixels)<input part="image-width" data-image="width" type="number" min="1" step="1"></label>
        <label>Height (pixels)<input part="image-height" data-image="height" type="number" min="1" step="1"></label>
      </div>
      <button part="image-preview-button" type="button" data-image-action="preview">Preview image</button>
      <img part="image-preview" alt="Image preview" hidden>
      <p part="image-error" id="image-error" role="status"></p>
      <div class="image-actions">
        <button part="image-apply-button" type="submit">Apply image</button>
        <button part="image-remove-button" type="button" data-image-action="remove">Remove image</button>
        <button part="image-cancel-button" type="button" data-image-action="cancel">Cancel</button>
      </div>
    </form>`;
    host.shadowRoot!.append(this.#dialog);
    this.#error = this.#dialog.querySelector('#image-error')!;
    this.#preview = this.#dialog.querySelector('img')!;
    this.#dialog.querySelector('form')!.addEventListener('submit', event => {
      event.preventDefault(); event.stopPropagation(); this.#apply(false);
    });
    this.#dialog.addEventListener('click', event => {
      const action = (event.target as Element).closest<HTMLElement>('[data-image-action]')?.dataset.imageAction;
      if (action === 'cancel') this.close();
      else if (action === 'remove') this.#apply(true);
      else if (action === 'preview') this.#showURLPreview();
      else if (action === 'upload') void this.#upload();
      else if (action === 'stop') { this.#stopUpload(); this.#progress('Upload cancelled. You can retry.'); }
    });
    this.#dialog.addEventListener('cancel', event => { event.preventDefault(); this.close(); });
    for (const type of ['input', 'change']) this.#dialog.addEventListener(type, event => event.stopPropagation());
    this.#input('file').addEventListener('change', () => this.#chooseFile());
    this.#input('src').addEventListener('input', () => { this.#clearFile(); this.#clearPreview(); });
    this.#input('decorative').addEventListener('change', () => this.#syncAlt());
    this.#preview.addEventListener('error', () => {
      if (this.#dialog.open && this.#preview.hasAttribute('src')) this.#error.textContent = 'Image preview could not be loaded. Check the source URL or file.';
    });
  }

  get uploader(): ARichTextImageUploader | undefined { return this.#uploader; }
  set uploader(value: ARichTextImageUploader | undefined) {
    if (value !== undefined && typeof value !== 'function') throw new TypeError('imageUploader must be a function or undefined.');
    this.#stopUpload(); this.#uploader = value; this.#clearFile(); this.#clearPreview(); this.sync();
  }
  get available(): boolean {
    return !this.#host.disabled && !this.#host.readOnly && this.#host.view === 'visual' && this.#host.isToolEnabled('image');
  }
  #input(name: string): HTMLInputElement { return this.#dialog.querySelector(`[data-image="${name}"]`)!; }

  open(path: readonly number[] | null = null): boolean {
    if (!this.available || this.#dialog.open || this.#host.shadowRoot!.querySelector('dialog[open]')) return false;
    const document = this.#host.getJSON();
    const block = path ? nodeAt(document, path) : null;
    const selection = this.#host.getSelection();
    if (path ? block?.type !== 'image' : !selection || String(selection.anchor.blockPath) !== String(selection.head.blockPath)) return false;
    this.#path = path ? [...path] : null;
    this.#selection = selection;
    this.#document = JSON.stringify(document);
    for (const field of ['src', 'alt', 'title', 'width', 'height'] as const) {
      this.#input(field).value = block?.type === 'image' ? String(block[field] ?? '') : '';
    }
    this.#input('decorative').checked = block?.type === 'image' && block.alt === '';
    this.#syncAlt();
    this.#error.textContent = ''; this.#progress('');
    this.#dialog.querySelector<HTMLButtonElement>('[data-image-action="remove"]')!.hidden = path === null;
    this.#returnFocus = path ? this.#host.shadowRoot!.querySelector<HTMLElement>(`[data-art-image-wrapper="${encodeARTPath(path)}"] button`)
      : this.#host.shadowRoot!.activeElement as HTMLElement | null;
    this.sync(); this.#dialog.showModal(); this.#input('src').focus();
    return true;
  }

  close(refocus = true): void {
    this.#stopUpload(); this.#clearFile(); this.#clearPreview();
    if (!this.#dialog.open) return;
    this.#dialog.close();
    if (refocus) {
      if (this.#returnFocus?.isConnected) this.#returnFocus.focus();
      else this.#host.focus({ preventScroll: true });
    }
  }

  sync(): void {
    if (!this.available) this.close(false);
    this.#dialog.querySelector<HTMLElement>('[data-image-upload]')!.hidden = !this.#uploader;
    for (const image of this.#host.shadowRoot!.querySelectorAll<HTMLImageElement>('img[data-art-image-path]')) {
      let wrapper = image.parentElement!;
      if (!wrapper.hasAttribute('data-art-image-wrapper')) {
        wrapper = this.#host.ownerDocument.createElement('div');
        wrapper.contentEditable = 'false';
        wrapper.setAttribute('part', 'image-container');
        wrapper.setAttribute('data-art-image-wrapper', image.getAttribute('data-art-image-path')!);
        image.replaceWith(wrapper); wrapper.append(image);
        const button = this.#host.ownerDocument.createElement('button');
        button.type = 'button'; button.textContent = 'Edit image';
        button.setAttribute('data-art-editor-ui', ''); button.setAttribute('part', 'image-edit-button');
        button.addEventListener('click', () => this.open(decodeARTPath(image.getAttribute('data-art-image-path')!)));
        wrapper.append(button);
      }
      wrapper.querySelector<HTMLButtonElement>('button')!.hidden = !this.available;
    }
    this.#busyState();
  }

  #syncAlt(): void {
    const decorative = this.#input('decorative').checked;
    this.#input('alt').disabled = decorative;
    this.#input('alt').required = !decorative;
  }
  #clearPreview(): void {
    this.#preview.hidden = true; this.#preview.removeAttribute('src');
    if (this.#previewURL) URL.revokeObjectURL(this.#previewURL);
    this.#previewURL = null;
  }
  #clearFile(): void { this.#file = null; this.#input('file').value = ''; this.#busyState(); }
  #progress(message: string): void { this.#dialog.querySelector<HTMLElement>('[data-image-progress]')!.textContent = message; }
  #busyState(): void {
    const busy = this.#pending !== null;
    for (const field of ['src', 'file', 'width', 'height']) this.#input(field).disabled = busy;
    this.#dialog.querySelector<HTMLButtonElement>('[type="submit"]')!.disabled = busy || this.#file !== null;
    this.#dialog.querySelector<HTMLButtonElement>('[data-image-action="upload"]')!.disabled = busy || !this.#file;
    this.#dialog.querySelector<HTMLButtonElement>('[data-image-action="stop"]')!.hidden = !busy;
    this.#dialog.querySelector<HTMLButtonElement>('[data-image-action="remove"]')!.disabled = busy;
    this.#dialog.querySelector<HTMLButtonElement>('[data-image-action="preview"]')!.disabled = busy || this.#file !== null;
  }
  #chooseFile(): void {
    this.#stopUpload(); this.#clearPreview(); this.#error.textContent = ''; this.#progress('');
    this.#file = this.#input('file').files?.[0] ?? null;
    if (this.#file && !['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'].includes(this.#file.type)) {
      this.#error.textContent = 'Choose a PNG, JPEG, WebP, GIF or AVIF image.'; this.#clearFile(); return;
    }
    if (this.#file) {
      this.#previewURL = URL.createObjectURL(this.#file);
      this.#preview.src = this.#previewURL; this.#preview.hidden = false;
      this.#progress('Preview ready. Upload the file before applying.');
    }
    this.#busyState();
  }
  #showURLPreview(): void {
    const src = this.#input('src').value.trim();
    if (!isSafeImageSource(src)) { this.#error.textContent = 'Enter an HTTP(S), relative or blob image URL.'; return; }
    this.#clearPreview(); this.#error.textContent = ''; this.#preview.src = src; this.#preview.hidden = false;
  }
  #stopUpload(): void {
    const pending = this.#pending; this.#pending = null; pending?.abort(); this.#busyState();
  }
  async #upload(): Promise<void> {
    if (!this.available || !this.#uploader || !this.#file || this.#pending) return;
    const controller = new AbortController(); this.#pending = controller;
    this.#error.textContent = ''; this.#progress('Uploading…'); this.#busyState();
    try {
      const result = await this.#uploader(this.#file, {
        signal: controller.signal,
        onProgress: progress => {
          if (this.#pending !== controller) return;
          if (Number.isFinite(progress.loaded) && progress.loaded >= 0 && progress.total && Number.isFinite(progress.total) && progress.total > 0) {
            this.#progress(`Uploading ${Math.round(Math.min(1, progress.loaded / progress.total) * 100)}%`);
          }
        },
      });
      if (this.#pending !== controller || controller.signal.aborted) return;
      if (!result || typeof result.src !== 'string' || !isSafeImageSource(result.src)) throw new Error('The uploader returned an unsupported image URL.');
      for (const size of [result.width, result.height]) {
        if (size !== undefined && (!Number.isSafeInteger(size) || size <= 0)) throw new Error('The uploader returned invalid image dimensions.');
      }
      this.#input('src').value = result.src;
      this.#input('width').value = String(result.width ?? ''); this.#input('height').value = String(result.height ?? '');
      this.#clearFile(); this.#progress('Upload complete. Choose Apply image to save the image in the document.');
    } catch (error) {
      if (this.#pending === controller && !controller.signal.aborted) {
        this.#error.textContent = error instanceof Error ? error.message : 'Upload failed. Retry or cancel.';
        this.#progress('Upload failed. You can retry the selected file.');
      }
    } finally {
      if (this.#pending === controller) { this.#pending = null; this.#busyState(); }
    }
  }
  #apply(remove: boolean): void {
    if (!this.available) { this.close(false); return; }
    if (this.#pending || (!remove && this.#file)) return;
    if (JSON.stringify(this.#host.getJSON()) !== this.#document) {
      this.#error.textContent = 'The document changed. Copy the image URL, cancel, and reopen the image editor.'; return;
    }
    try {
      const state = { document: this.#host.getJSON(), selection: this.#selection };
      const image: Omit<ARTImageNode, 'type'> = {
        src: this.#input('src').value.trim(),
        alt: this.#input('decorative').checked ? '' : this.#input('alt').value.trim(),
        ...(this.#input('title').value ? { title: this.#input('title').value } : {}),
      };
      if (!remove && !this.#input('decorative').checked && !image.alt) throw new Error('Describe the image with alternative text, or mark it as decorative.');
      if (!remove) for (const field of ['width', 'height'] as const) {
        if (this.#input(field).validity.badInput) throw new Error('Image dimensions must be positive whole numbers.');
        if (this.#input(field).value !== '') image[field] = Number(this.#input(field).value);
      }
      const command = remove && this.#path ? removeImageBlock(state, this.#path) : setImageBlock(state, this.#path, image);
      if (!command) throw new Error('The image can no longer be edited at this location.');
      this.#host.dispatch(command); this.close(false); this.#host.focus({ preventScroll: true });
    } catch (error) { this.#error.textContent = error instanceof Error ? error.message : 'Unable to apply image.'; }
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
