import { decodeRenderableImage, inspectImage } from './decode.js';
import { MediaError, throwIfAborted } from './errors.js';
import { containImageSize } from './geometry.js';
import type {
  EncodableImageType,
  ImageProcessingOptions,
  PreparedImage,
} from './types.js';

const ENCODABLE_TYPES: readonly EncodableImageType[] = ['image/jpeg', 'image/png', 'image/webp'];

export async function prepareImage(
  source: Blob,
  options: ImageProcessingOptions = {},
): Promise<PreparedImage> {
  validateQuality(options.quality);
  const originalInfo = await inspectImage(source, options);
  throwIfAborted(options.signal);

  const name = blobName(source);
  if (!options.process) {
    return {
      original: source,
      blob: source,
      ...(name ? { name } : {}),
      processed: false,
      mimeType: source.type,
      size: source.size,
      width: originalInfo.width,
      height: originalInfo.height,
      originalInfo,
    };
  }

  const outputType = options.outputType ?? defaultOutputType(source.type);
  const target = containImageSize(
    originalInfo.width,
    originalInfo.height,
    options.outputMaxWidth,
    options.outputMaxHeight,
  );

  const decoded = await decodeRenderableImage(source, options.signal);
  try {
    throwIfAborted(options.signal);
    const blob = await renderToBlob(
      decoded.source,
      target.width,
      target.height,
      outputType,
      options.quality,
      options.signal,
    );
    throwIfAborted(options.signal);

    if (blob.type && blob.type !== outputType) {
      throw new MediaError(
        'encode-failed',
        `Browser returned ${blob.type} when ${outputType} was requested`,
      );
    }

    return {
      original: source,
      blob,
      ...(name ? { name: renameForMime(name, outputType) } : {}),
      processed: true,
      mimeType: blob.type || outputType,
      size: blob.size,
      width: target.width,
      height: target.height,
      originalInfo,
    };
  } finally {
    decoded.close();
  }
}

async function renderToBlob(
  source: CanvasImageSource,
  width: number,
  height: number,
  type: EncodableImageType,
  quality: number | undefined,
  signal?: AbortSignal,
): Promise<Blob> {
  throwIfAborted(signal);

  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) throw new MediaError('processing-unavailable', '2D OffscreenCanvas is unavailable');
    context.drawImage(source, 0, 0, width, height);
    try {
      return await canvas.convertToBlob({
        type,
        ...(quality !== undefined ? { quality } : {}),
      });
    } catch (error) {
      throw new MediaError('encode-failed', `Failed to encode ${type}`, error);
    }
  }

  if (typeof document === 'undefined') {
    throw new MediaError('processing-unavailable', 'Canvas image processing requires a browser DOM or OffscreenCanvas');
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new MediaError('processing-unavailable', 'Canvas 2D context is unavailable');
  context.drawImage(source, 0, 0, width, height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new MediaError('encode-failed', `Failed to encode ${type}`));
          return;
        }
        resolve(blob);
      },
      type,
      quality,
    );
  });
}

function defaultOutputType(sourceType: string): EncodableImageType {
  return ENCODABLE_TYPES.includes(sourceType as EncodableImageType)
    ? sourceType as EncodableImageType
    : 'image/webp';
}

function validateQuality(quality?: number): void {
  if (quality === undefined) return;
  if (!Number.isFinite(quality) || quality < 0 || quality > 1) {
    throw new TypeError('quality must be between 0 and 1');
  }
}

function blobName(blob: Blob): string | undefined {
  const candidate = blob as Blob & { name?: unknown };
  return typeof candidate.name === 'string' && candidate.name.trim() ? candidate.name : undefined;
}

function renameForMime(name: string, type: EncodableImageType): string {
  const extension = type === 'image/jpeg' ? '.jpg' : type === 'image/png' ? '.png' : '.webp';
  const base = name.replace(/\.[^.]+$/, '');
  return `${base || 'image'}${extension}`;
}
