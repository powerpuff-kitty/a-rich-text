// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MediaError,
  containImageSize,
  createObjectURLPreview,
  inspectImage,
  prepareImage,
  validateEncodedImage,
} from '../src/index.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('@arichtext/media', () => {
  it('calculates contain resizing without upscaling', () => {
    expect(containImageSize(4000, 2000, 1000, 1000)).toEqual({ width: 1000, height: 500 });
    expect(containImageSize(500, 250, 1000, 1000)).toEqual({ width: 500, height: 250 });
    expect(containImageSize(1000, 2000, undefined, 500)).toEqual({ width: 250, height: 500 });
  });

  it('rejects unsupported types and oversized sources before decode', () => {
    const decode = vi.fn();
    vi.stubGlobal('createImageBitmap', decode);

    expect(() => validateEncodedImage(new Blob(['x'], { type: 'text/plain' }))).toThrowError(MediaError);
    expect(() => validateEncodedImage(new Blob(['1234'], { type: 'image/png' }), { maxBytes: 2 })).toThrowError(
      expect.objectContaining({ code: 'file-too-large' }),
    );
    expect(decode).not.toHaveBeenCalled();
  });

  it('validates decoded dimensions and pixel count', async () => {
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 4000, height: 3000, close })));
    const blob = new Blob(['image'], { type: 'image/jpeg' });

    await expect(inspectImage(blob, { maxPixels: 10_000_000 })).rejects.toMatchObject({
      code: 'pixels-too-large',
    });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('can return the validated original without re-encoding', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 800, height: 600, close: vi.fn() })));
    const file = new File(['source'], 'photo.jpg', { type: 'image/jpeg' });

    const prepared = await prepareImage(file);

    expect(prepared.blob).toBe(file);
    expect(prepared.original).toBe(file);
    expect(prepared.processed).toBe(false);
    expect(prepared.name).toBe('photo.jpg');
    expect(prepared.width).toBe(800);
    expect(prepared.height).toBe(600);
  });

  it('re-encodes and resizes through OffscreenCanvas when requested', async () => {
    const closeFirst = vi.fn();
    const closeSecond = vi.fn();
    const bitmaps = [
      { width: 4000, height: 2000, close: closeFirst },
      { width: 4000, height: 2000, close: closeSecond },
    ];
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmaps.shift()!));

    const drawImage = vi.fn();
    const convertToBlob = vi.fn(async (options: BlobPropertyBag & { quality?: number }) =>
      new Blob(['processed'], { type: options.type }),
    );
    class FakeOffscreenCanvas {
      constructor(public width: number, public height: number) {}
      getContext() {
        return { drawImage };
      }
      convertToBlob = convertToBlob;
    }
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);

    const file = new File(['source'], 'photo.png', { type: 'image/png' });
    const prepared = await prepareImage(file, {
      process: true,
      outputMaxWidth: 1000,
      outputMaxHeight: 1000,
      outputType: 'image/webp',
      quality: 0.8,
    });

    expect(prepared.processed).toBe(true);
    expect(prepared.width).toBe(1000);
    expect(prepared.height).toBe(500);
    expect(prepared.mimeType).toBe('image/webp');
    expect(prepared.name).toBe('photo.webp');
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1000, 500);
    expect(convertToBlob).toHaveBeenCalledWith({ type: 'image/webp', quality: 0.8 });
    expect(closeSecond).toHaveBeenCalledTimes(1);
  });

  it('revokes preview URLs exactly once', () => {
    const runtime = {
      createObjectURL: vi.fn(() => 'blob:test'),
      revokeObjectURL: vi.fn(),
    };
    const preview = createObjectURLPreview(new Blob(['x']), runtime);

    expect(preview.url).toBe('blob:test');
    expect(preview.revoked).toBe(false);
    preview.revoke();
    preview.revoke();
    expect(preview.revoked).toBe(true);
    expect(runtime.revokeObjectURL).toHaveBeenCalledTimes(1);
  });
});
