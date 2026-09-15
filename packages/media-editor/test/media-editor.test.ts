// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { textPoint, textSelection, transaction } from '../../engine/src/index.js';
import type { ImageUploadProvider } from '../../media/src/index.js';
import { ARichTextElement } from '../../web-component/src/index.js';
import {
  MediaEditorError,
  attachImageMedia,
  insertImageBlock,
} from '../src/index.js';

function createEditor(): ARichTextElement {
  const editor = document.createElement('a-rich-text') as ARichTextElement;
  document.body.append(editor);
  return editor;
}

function surface(editor: ARichTextElement): HTMLDivElement {
  return editor.shadowRoot!.querySelector<HTMLDivElement>('[part="editor"]')!;
}

function select(editor: ARichTextElement, offset: number): void {
  editor.dispatch(transaction().setSelection(textSelection(textPoint([0], offset))).build());
}

function fileList(file: File): FileList {
  return {
    0: file,
    length: 1,
    item: (index: number) => index === 0 ? file : null,
    [Symbol.iterator]: function* () { yield file; },
  } as unknown as FileList;
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.getSelection()?.removeAllRanges();
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 640, height: 480, close: vi.fn() })));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('@arichtext/media-editor', () => {
  it('inserts an already-hosted image as a block at the logical selection', () => {
    const editor = createEditor();
    editor.setText('AB');
    select(editor, 1);

    const result = insertImageBlock(editor, {
      src: 'https://cdn.example/photo.webp',
      alt: 'Photo',
      width: 640,
      height: 480,
    });

    expect(result.documentChanged).toBe(true);
    expect(editor.getJSON().content).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'A' }] },
      {
        type: 'image',
        src: 'https://cdn.example/photo.webp',
        alt: 'Photo',
        width: 640,
        height: 480,
      },
      { type: 'paragraph', content: [{ type: 'text', text: 'B' }] },
    ]);
    expect(editor.canUndo).toBe(true);
  });

  it('rejects unsafe image URLs before mutating ART', () => {
    const editor = createEditor();
    editor.setText('safe');
    select(editor, 2);

    expect(() => insertImageBlock(editor, { src: 'javascript:alert(1)' })).toThrowError(MediaEditorError);
    expect(editor.getText()).toBe('safe');
  });

  it('uploads through the provider and inserts the final URL', async () => {
    const editor = createEditor();
    editor.setText('AB');
    select(editor, 1);
    const provider: ImageUploadProvider = {
      async upload(image, { onProgress }) {
        onProgress?.({ loaded: image.size, total: image.size });
        return { url: 'https://cdn.example/upload.webp', id: 'asset-1' };
      },
    };
    const onProgress = vi.fn();
    const controller = attachImageMedia(editor, { provider, onProgress, alt: 'Uploaded' });
    const file = new File(['image'], 'upload.webp', { type: 'image/webp' });

    const result = await controller.insertFile(file).promise;

    expect(result.upload.id).toBe('asset-1');
    expect(onProgress).toHaveBeenCalled();
    expect(editor.getJSON().content[1]).toMatchObject({
      type: 'image',
      src: 'https://cdn.example/upload.webp',
      alt: 'Uploaded',
      width: 640,
      height: 480,
    });
    controller.destroy();
  });

  it('refuses stale insertion if the document changes while upload is pending', async () => {
    const editor = createEditor();
    editor.setText('AB');
    select(editor, 1);

    let resolveUpload!: (value: { url: string; id: string }) => void;
    let notifyUploadStarted!: () => void;
    const uploadStarted = new Promise<void>((resolve) => { notifyUploadStarted = resolve; });
    const provider: ImageUploadProvider = {
      upload: () => new Promise((resolve) => {
        resolveUpload = resolve;
        notifyUploadStarted();
      }),
    };
    const controller = attachImageMedia(editor, { provider });
    const file = new File(['image'], 'upload.webp', { type: 'image/webp' });
    const task = controller.insertFile(file);

    await uploadStarted;
    editor.setText('changed');
    resolveUpload({ url: 'https://cdn.example/orphan.webp', id: 'orphan' });

    await expect(task.promise).rejects.toMatchObject({
      code: 'document-changed',
      uploadResult: { id: 'orphan' },
    });
    expect(editor.getText()).toBe('changed');
    controller.destroy();
  });

  it('cancels in-flight upload without changing the document', async () => {
    const editor = createEditor();
    editor.setText('AB');
    select(editor, 1);
    const provider: ImageUploadProvider = {
      upload(_image, { signal }) {
        return new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
        });
      },
    };
    const controller = attachImageMedia(editor, { provider });
    const task = controller.insertFile(new File(['image'], 'upload.webp', { type: 'image/webp' }));

    await Promise.resolve();
    task.cancel('user');

    await expect(task.promise).rejects.toMatchObject({ code: 'aborted' });
    expect(editor.getText()).toBe('AB');
    controller.destroy();
  });

  it('captures an image paste before the base text paste handler', async () => {
    const editor = createEditor();
    editor.setText('AB');
    select(editor, 1);
    const provider: ImageUploadProvider = {
      async upload() {
        return { url: 'https://cdn.example/pasted.webp' };
      },
    };
    const controller = attachImageMedia(editor, { provider });
    const file = new File(['image'], 'paste.webp', { type: 'image/webp' });
    const event = new Event('paste', {
      bubbles: true,
      composed: true,
      cancelable: true,
    }) as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', {
      configurable: true,
      value: { files: fileList(file), types: ['Files'], getData: () => '' },
    });

    surface(editor).dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    await vi.waitFor(() => {
      expect(editor.getJSON().content.some((block) => block.type === 'image')).toBe(true);
    });
    controller.destroy();
  });
});
