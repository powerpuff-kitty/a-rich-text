export type MediaErrorCode =
  | 'invalid-file'
  | 'unsupported-type'
  | 'file-too-large'
  | 'decode-unavailable'
  | 'decode-failed'
  | 'dimensions-too-large'
  | 'pixels-too-large'
  | 'processing-unavailable'
  | 'encode-failed'
  | 'aborted'
  | 'upload-failed'
  | 'invalid-upload-result';

export class MediaError extends Error {
  readonly code: MediaErrorCode;
  readonly cause?: unknown;

  constructor(code: MediaErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'MediaError';
    this.code = code;
    if (cause !== undefined) this.cause = cause;
  }
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new MediaError('aborted', 'Media operation was aborted', signal.reason);
  }
}
