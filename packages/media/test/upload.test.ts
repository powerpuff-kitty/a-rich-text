// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';
import {
  MediaError,
  normalizeProgress,
  uploadPreparedImage,
  type ImageUploadProvider,
  type PreparedImage,
} from '../src/index.js';

function prepared(): PreparedImage {
  const blob = new Blob(['image'], { type: 'image/webp' });
  return {
    original: blob,
    blob,
    processed: true,
    mimeType: 'image/webp',
    size: blob.size,
    width: 100,
    height: 50,
    originalInfo: {
      mimeType: 'image/webp',
      size: blob.size,
      width: 100,
      height: 50,
      pixels: 5000,
    },
  };
}

describe('media upload provider contract', () => {
  it('normalizes provider progress and returns provider metadata', async () => {
    const onProgress = vi.fn();
    const provider: ImageUploadProvider = {
      async upload(_image, context) {
        context.onProgress?.({ loaded: 25, total: 100 });
        context.onProgress?.({ loaded: 100, total: 100 });
        return {
          url: 'https://cdn.example/image.webp',
          id: 'asset-1',
          metadata: { bucket: 'uploads' },
        };
      },
    };

    const result = await uploadPreparedImage(prepared(), provider, { onProgress });

    expect(onProgress).toHaveBeenNthCalledWith(1, { loaded: 25, total: 100, fraction: 0.25 });
    expect(onProgress).toHaveBeenNthCalledWith(2, { loaded: 100, total: 100, fraction: 1 });
    expect(result.id).toBe('asset-1');
  });

  it('does not call a provider when already aborted', async () => {
    const controller = new AbortController();
    controller.abort('cancelled');
    const upload = vi.fn();

    await expect(uploadPreparedImage(prepared(), { upload }, { signal: controller.signal })).rejects.toMatchObject({
      code: 'aborted',
    });
    expect(upload).not.toHaveBeenCalled();
  });

  it('wraps provider failures in a typed media error', async () => {
    const provider: ImageUploadProvider = {
      async upload() {
        throw new Error('storage unavailable');
      },
    };

    await expect(uploadPreparedImage(prepared(), provider)).rejects.toMatchObject({
      name: 'MediaError',
      code: 'upload-failed',
    });
  });

  it('rejects empty provider URLs', async () => {
    const provider: ImageUploadProvider = {
      async upload() {
        return { url: '   ' };
      },
    };

    await expect(uploadPreparedImage(prepared(), provider)).rejects.toMatchObject({
      code: 'invalid-upload-result',
    });
  });

  it('clamps fractional progress while preserving loaded bytes', () => {
    expect(normalizeProgress({ loaded: 120, total: 100 })).toEqual({
      loaded: 120,
      total: 100,
      fraction: 1,
    });
    expect(() => normalizeProgress({ loaded: -1, total: 100 })).toThrow(TypeError);
  });

  it('keeps MediaError failures from providers intact', async () => {
    const provider: ImageUploadProvider = {
      async upload() {
        throw new MediaError('aborted', 'provider cancelled');
      },
    };
    await expect(uploadPreparedImage(prepared(), provider)).rejects.toMatchObject({ code: 'aborted' });
  });
});
