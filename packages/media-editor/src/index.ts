import type { ARTBlockNode } from '@arichtext/core';
import { transaction, type ARTSelection, type TransactionResult } from '@arichtext/engine';
import {
  uploadImage,
  type ImageProcessingOptions,
  type ImageUploadProvider,
  type PreparedImage,
  type UploadProgress,
  type UploadResult,
} from '@arichtext/media';
import type { ARichTextElement } from '@arichtext/web-component';

export type ImageInsertSource = 'programmatic' | 'paste' | 'drop' | 'picker';

export type MediaEditorErrorCode =
  | 'editor-locked'
  | 'no-selection'
  | 'cross-block-selection'
  | 'document-changed'
  | 'unsafe-url';

export class MediaEditorError extends Error {
  readonly code: MediaEditorErrorCode;
  readonly uploadResult?: UploadResult;

  constructor(code: MediaEditorErrorCode, message: string, uploadResult?: UploadResult) {
    super(message);
    this.name = 'MediaEditorError';
    this.code = code;
    if (uploadResult) this.uploadResult = uploadResult;
  }
}

export interface InsertImageBlockInput {
  src: string;
  alt?: string;
  title?: string;
  width?: number;
  height?: number;
}

export interface ImageInsertResult {
  image: PreparedImage;
  upload: UploadResult;
  transaction: TransactionResult;
}

export interface ImageInsertTask {
  readonly promise: Promise<ImageInsertResult>;
  readonly signal: AbortSignal;
  cancel(reason?: unknown): void;
}

export interface MediaEditorOptions {
  provider: ImageUploadProvider;
  processing?: Omit<ImageProcessingOptions, 'signal'>;
  accept?: string;
  capturePaste?: boolean;
  captureDrop?: boolean;
  alt?: string | ((file: Blob, upload: UploadResult) => string);
  title?: string | ((file: Blob, upload: UploadResult) => string | undefined);
  onProgress?: (progress: UploadProgress, file: Blob, source: ImageInsertSource) => void;
  onComplete?: (result: ImageInsertResult, file: Blob, source: ImageInsertSource) => void;
  onError?: (error: unknown, file: Blob, source: ImageInsertSource) => void;
}

export interface MediaUploadProgressDetail {
  file: Blob;
  source: ImageInsertSource;
  progress: UploadProgress;
}

export interface MediaUploadCompleteDetail {
  file: Blob;
  source: ImageInsertSource;
  result: ImageInsertResult;
}

export interface MediaUploadErrorDetail {
  file: Blob;
  source: ImageInsertSource;
  error: unknown;
}

/** Insert an already-hosted image without loading the browser media pipeline. */
export function insertImageBlock(
  editor: ARichTextElement,
  image: InsertImageBlockInput,
  selection: ARTSelection | null = editor.getSelection(),
): TransactionResult {
  if (editor.disabled || editor.readOnly) {
    throw new MediaEditorError('editor-locked', 'Cannot insert an image into a disabled or readonly editor');
  }
  if (!selection) throw new MediaEditorError('no-selection', 'Image insertion requires an editor selection');
  if (!samePath(selection.anchor.blockPath, selection.head.blockPath)) {
    throw new MediaEditorError('cross-block-selection', 'Image insertion currently requires one text block');
  }
  if (!safeImageUrl(image.src)) {
    throw new MediaEditorError('unsafe-url', 'Image source uses an unsafe or unsupported URL protocol');
  }

  const node: ARTBlockNode = {
    type: 'image',
    src: image.src,
    alt: image.alt ?? '',
    ...(image.title !== undefined ? { title: image.title } : {}),
    ...(image.width !== undefined ? { width: image.width } : {}),
    ...(image.height !== undefined ? { height: image.height } : {}),
  };

  return editor.dispatch(
    transaction()
      .replaceFragment(selection.anchor, selection.head, [node])
      .setMeta('command', 'insertImage')
      .build(),
  );
}

export class ImageMediaController {
  readonly editor: ARichTextElement;
  readonly options: MediaEditorOptions;
  #destroyed = false;
  #tasks = new Set<AbortController>();

  constructor(editor: ARichTextElement, options: MediaEditorOptions) {
    if (!options?.provider) throw new TypeError('Media editor requires an ImageUploadProvider');
    this.editor = editor;
    this.options = options;

    if (options.capturePaste !== false) editor.addEventListener('paste', this.#handlePaste, true);
    if (options.captureDrop !== false) {
      editor.addEventListener('dragover', this.#handleDragOver, true);
      editor.addEventListener('drop', this.#handleDrop, true);
    }
  }

  insertFile(file: Blob, source: ImageInsertSource = 'programmatic'): ImageInsertTask {
    if (this.#destroyed) throw new Error('Media editor controller has been destroyed');
    if (this.editor.disabled || this.editor.readOnly) {
      return rejectedTask(new MediaEditorError('editor-locked', 'Editor is disabled or readonly'));
    }

    const selection = this.editor.getSelection();
    if (!selection) return rejectedTask(new MediaEditorError('no-selection', 'Image upload requires an editor selection'));
    if (!samePath(selection.anchor.blockPath, selection.head.blockPath)) {
      return rejectedTask(new MediaEditorError('cross-block-selection', 'Image upload currently requires one text block'));
    }

    const initialDocument = this.editor.serializeJSON();
    const controller = new AbortController();
    this.#tasks.add(controller);

    const promise = this.#runInsert(file, source, selection, initialDocument, controller)
      .finally(() => this.#tasks.delete(controller));

    return {
      promise,
      signal: controller.signal,
      cancel: (reason?: unknown) => controller.abort(reason),
    };
  }

  async pickImage(): Promise<ImageInsertTask | null> {
    if (typeof document === 'undefined') throw new Error('Image picker requires a browser DOM');
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = this.options.accept ?? 'image/*';
    input.multiple = false;
    input.hidden = true;
    document.body.append(input);

    try {
      const file = await new Promise<File | null>((resolve) => {
        let settled = false;
        const finish = (value: File | null) => {
          if (settled) return;
          settled = true;
          resolve(value);
        };
        input.addEventListener('change', () => finish(input.files?.[0] ?? null), { once: true });
        input.addEventListener('cancel', () => finish(null), { once: true });
        input.click();
      });
      return file ? this.insertFile(file, 'picker') : null;
    } finally {
      input.remove();
    }
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.editor.removeEventListener('paste', this.#handlePaste, true);
    this.editor.removeEventListener('dragover', this.#handleDragOver, true);
    this.editor.removeEventListener('drop', this.#handleDrop, true);
    for (const controller of this.#tasks) controller.abort('media-editor-destroyed');
    this.#tasks.clear();
  }

  async #runInsert(
    file: Blob,
    source: ImageInsertSource,
    selection: ARTSelection,
    initialDocument: string,
    controller: AbortController,
  ): Promise<ImageInsertResult> {
    try {
      const { image, result: upload } = await uploadImage(file, this.options.provider, {
        ...(this.options.processing ?? {}),
        signal: controller.signal,
        onProgress: (progress) => {
          this.options.onProgress?.(progress, file, source);
          this.editor.dispatchEvent(new CustomEvent<MediaUploadProgressDetail>('media-upload-progress', {
            detail: { file, source, progress },
            bubbles: true,
            composed: true,
          }));
        },
      });

      if (this.editor.serializeJSON() !== initialDocument) {
        throw new MediaEditorError(
          'document-changed',
          'Editor document changed while the image was uploading; refusing stale insertion',
          upload,
        );
      }

      const tx = insertImageBlock(this.editor, {
        src: upload.url,
        alt: resolveString(this.options.alt, file, upload) ?? '',
        title: resolveString(this.options.title, file, upload),
        width: upload.width ?? image.width,
        height: upload.height ?? image.height,
      }, selection);

      const result: ImageInsertResult = { image, upload, transaction: tx };
      this.options.onComplete?.(result, file, source);
      this.editor.dispatchEvent(new CustomEvent<MediaUploadCompleteDetail>('media-upload-complete', {
        detail: { file, source, result },
        bubbles: true,
        composed: true,
      }));
      return result;
    } catch (error) {
      this.options.onError?.(error, file, source);
      this.editor.dispatchEvent(new CustomEvent<MediaUploadErrorDetail>('media-upload-error', {
        detail: { file, source, error },
        bubbles: true,
        composed: true,
      }));
      throw error;
    }
  }

  #handlePaste = (event: Event): void => {
    const clipboardEvent = event as ClipboardEvent;
    const file = firstImageFile(clipboardEvent.clipboardData?.files);
    if (!file) return;

    clipboardEvent.preventDefault();
    clipboardEvent.stopPropagation();
    this.insertFile(file, 'paste').promise.catch(() => undefined);
  };

  #handleDragOver = (event: Event): void => {
    const dragEvent = event as DragEvent;
    if (!firstImageFile(dragEvent.dataTransfer?.files)) return;
    dragEvent.preventDefault();
    if (dragEvent.dataTransfer) dragEvent.dataTransfer.dropEffect = 'copy';
  };

  #handleDrop = (event: Event): void => {
    const dragEvent = event as DragEvent;
    const file = firstImageFile(dragEvent.dataTransfer?.files);
    if (!file) return;

    dragEvent.preventDefault();
    dragEvent.stopPropagation();
    this.insertFile(file, 'drop').promise.catch(() => undefined);
  };
}

export function attachImageMedia(editor: ARichTextElement, options: MediaEditorOptions): ImageMediaController {
  return new ImageMediaController(editor, options);
}

function firstImageFile(files: FileList | undefined | null): File | null {
  if (!files) return null;
  for (let index = 0; index < files.length; index += 1) {
    const file = files.item(index);
    if (file?.type.startsWith('image/')) return file;
  }
  return null;
}

function resolveString(
  value: MediaEditorOptions['alt'] | MediaEditorOptions['title'],
  file: Blob,
  upload: UploadResult,
): string | undefined {
  if (typeof value === 'function') return value(file, upload);
  return value;
}

function samePath(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function safeImageUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^(?:\/|\.\/|\.\.\/|#|\?)/.test(trimmed)) return true;
  if (/^data:image\/(?:png|gif|jpe?g|webp|avif);/i.test(trimmed)) return true;

  try {
    const parsed = new URL(trimmed, 'https://arichtext.invalid');
    if (parsed.origin === 'https://arichtext.invalid' && !trimmed.startsWith('//')) return true;
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'blob:';
  } catch {
    return false;
  }
}

function rejectedTask(error: unknown): ImageInsertTask {
  const controller = new AbortController();
  return {
    promise: Promise.reject(error),
    signal: controller.signal,
    cancel: (reason?: unknown) => controller.abort(reason),
  };
}
