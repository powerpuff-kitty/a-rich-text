import { MediaError, throwIfAborted } from './errors.js';
import { prepareImage } from './process.js';
import type {
  ImageUploadProvider,
  PreparedImage,
  UploadImageOptions,
  UploadProgress,
  UploadResult,
} from './types.js';

export async function uploadPreparedImage(
  image: PreparedImage,
  provider: ImageUploadProvider,
  options: Pick<UploadImageOptions, 'signal' | 'onProgress'> = {},
): Promise<UploadResult> {
  if (!provider || typeof provider.upload !== 'function') {
    throw new TypeError('Image upload provider must implement upload(image, context)');
  }
  throwIfAborted(options.signal);

  try {
    const result = await provider.upload(image, {
      signal: options.signal,
      onProgress: options.onProgress
        ? (progress) => options.onProgress!(normalizeProgress(progress))
        : undefined,
    });
    throwIfAborted(options.signal);
    validateUploadResult(result);
    return result;
  } catch (error) {
    if (error instanceof MediaError) throw error;
    if (options.signal?.aborted) throwIfAborted(options.signal);
    throw new MediaError('upload-failed', 'Image upload provider failed', error);
  }
}

export async function uploadImage(
  source: Blob,
  provider: ImageUploadProvider,
  options: UploadImageOptions = {},
): Promise<{ image: PreparedImage; result: UploadResult }> {
  const image = await prepareImage(source, options);
  throwIfAborted(options.signal);
  const result = await uploadPreparedImage(image, provider, options);
  return { image, result };
}

export function normalizeProgress(progress: UploadProgress): UploadProgress {
  if (!Number.isFinite(progress.loaded) || progress.loaded < 0) {
    throw new TypeError('Upload progress loaded bytes must be a non-negative finite number');
  }

  if (progress.total === undefined) return { loaded: progress.loaded };
  if (!Number.isFinite(progress.total) || progress.total < 0) {
    throw new TypeError('Upload progress total bytes must be a non-negative finite number');
  }

  const total = progress.total;
  return {
    loaded: progress.loaded,
    total,
    ...(total > 0 ? { fraction: Math.min(1, Math.max(0, progress.loaded / total)) } : {}),
  };
}

function validateUploadResult(result: UploadResult): void {
  if (!result || typeof result !== 'object' || typeof result.url !== 'string' || result.url.trim().length === 0) {
    throw new MediaError('invalid-upload-result', 'Upload provider must return a non-empty URL');
  }
}
