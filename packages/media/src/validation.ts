import { MediaError } from './errors.js';
import { DEFAULT_IMAGE_TYPES, type ImageInfo, type ImageValidationOptions } from './types.js';

export function validateEncodedImage(blob: Blob, options: ImageValidationOptions = {}): void {
  if (!blob || typeof blob.size !== 'number' || typeof blob.type !== 'string') {
    throw new MediaError('invalid-file', 'Image source must be a Blob or File');
  }

  const allowedTypes = options.allowedTypes ?? DEFAULT_IMAGE_TYPES;
  if (!blob.type || !allowedTypes.includes(blob.type)) {
    throw new MediaError('unsupported-type', `Unsupported image MIME type: ${blob.type || '(empty)'}`);
  }

  if (options.maxBytes !== undefined) {
    assertPositiveLimit(options.maxBytes, 'maxBytes');
    if (blob.size > options.maxBytes) {
      throw new MediaError('file-too-large', `Image is ${blob.size} bytes; maximum is ${options.maxBytes}`);
    }
  }
}

export function validateDecodedImage(info: ImageInfo, options: ImageValidationOptions = {}): void {
  if (!Number.isInteger(info.width) || info.width <= 0 || !Number.isInteger(info.height) || info.height <= 0) {
    throw new MediaError('decode-failed', 'Decoded image dimensions are invalid');
  }

  if (options.maxWidth !== undefined) {
    assertPositiveLimit(options.maxWidth, 'maxWidth');
    if (info.width > options.maxWidth) {
      throw new MediaError('dimensions-too-large', `Image width ${info.width}px exceeds ${options.maxWidth}px`);
    }
  }
  if (options.maxHeight !== undefined) {
    assertPositiveLimit(options.maxHeight, 'maxHeight');
    if (info.height > options.maxHeight) {
      throw new MediaError('dimensions-too-large', `Image height ${info.height}px exceeds ${options.maxHeight}px`);
    }
  }
  if (options.maxPixels !== undefined) {
    assertPositiveLimit(options.maxPixels, 'maxPixels');
    if (info.pixels > options.maxPixels) {
      throw new MediaError('pixels-too-large', `Image has ${info.pixels} pixels; maximum is ${options.maxPixels}`);
    }
  }
}

function assertPositiveLimit(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new TypeError(`${name} must be a positive finite number`);
}
