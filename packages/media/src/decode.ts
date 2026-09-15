import { MediaError, throwIfAborted } from './errors.js';
import type { ImageInfo, ImageValidationOptions } from './types.js';
import { validateDecodedImage, validateEncodedImage } from './validation.js';

export async function inspectImage(
  blob: Blob,
  options: ImageValidationOptions & { signal?: AbortSignal } = {},
): Promise<ImageInfo> {
  validateEncodedImage(blob, options);
  throwIfAborted(options.signal);

  const { width, height } = await decodeDimensions(blob, options.signal);
  throwIfAborted(options.signal);

  const info: ImageInfo = {
    mimeType: blob.type,
    size: blob.size,
    width,
    height,
    pixels: width * height,
  };
  validateDecodedImage(info, options);
  return info;
}

export async function decodeRenderableImage(
  blob: Blob,
  signal?: AbortSignal,
): Promise<{ source: CanvasImageSource; width: number; height: number; close(): void }> {
  throwIfAborted(signal);

  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      throwIfAborted(signal);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch (error) {
      if (signal?.aborted) throwIfAborted(signal);
      // Fall through to HTMLImageElement where available.
      if (typeof document === 'undefined') {
        throw new MediaError('decode-failed', 'Unable to decode image with createImageBitmap', error);
      }
    }
  }

  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    throw new MediaError('decode-unavailable', 'No browser image decoder is available');
  }

  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = 'async';
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new MediaError('decode-failed', 'Browser failed to decode image'));
    });
    image.src = url;
    await raceAbort(loaded, signal);
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => undefined,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function decodeDimensions(blob: Blob, signal?: AbortSignal): Promise<{ width: number; height: number }> {
  const decoded = await decodeRenderableImage(blob, signal);
  try {
    if (!decoded.width || !decoded.height) {
      throw new MediaError('decode-failed', 'Decoded image has zero dimensions');
    }
    return { width: decoded.width, height: decoded.height };
  } finally {
    decoded.close();
  }
}

async function raceAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  throwIfAborted(signal);

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new MediaError('aborted', 'Media operation was aborted', signal.reason));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}
