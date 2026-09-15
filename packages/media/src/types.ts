export const DEFAULT_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
] as const;

export type EncodableImageType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface ImageValidationOptions {
  allowedTypes?: readonly string[];
  /** Maximum encoded source bytes. Omit for no byte-size limit. */
  maxBytes?: number;
  /** Maximum decoded pixel count (`width * height`). Omit for no pixel limit. */
  maxPixels?: number;
  /** Reject decoded images wider than this value. */
  maxWidth?: number;
  /** Reject decoded images taller than this value. */
  maxHeight?: number;
}

export interface ImageInfo {
  mimeType: string;
  size: number;
  width: number;
  height: number;
  pixels: number;
}

export interface ImageProcessingOptions extends ImageValidationOptions {
  /** Re-encode the image in the browser. Defaults to false. */
  process?: boolean;
  /** Resize output to fit within this width. */
  outputMaxWidth?: number;
  /** Resize output to fit within this height. */
  outputMaxHeight?: number;
  /** Encoding MIME type. Defaults to source type when encodable, otherwise WebP. */
  outputType?: EncodableImageType;
  /** Encoder quality from 0–1 for formats that support it. */
  quality?: number;
  /** Optional cancellation. */
  signal?: AbortSignal;
}

export interface PreparedImage {
  /** Validated original source. */
  original: Blob;
  blob: Blob;
  name?: string;
  processed: boolean;
  mimeType: string;
  size: number;
  width: number;
  height: number;
  originalInfo: ImageInfo;
}

export interface UploadProgress {
  loaded: number;
  total?: number;
  /** Convenience fraction in the range 0..1 when a total is known. */
  fraction?: number;
}

export interface UploadResult {
  url: string;
  /** Optional storage/provider-specific identifier. */
  id?: string;
  width?: number;
  height?: number;
  mimeType?: string;
  size?: number;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface ImageUploadContext {
  signal?: AbortSignal;
  onProgress?: (progress: UploadProgress) => void;
}

export interface ImageUploadProvider {
  upload(image: PreparedImage, context: ImageUploadContext): Promise<UploadResult>;
}

export interface UploadImageOptions extends ImageProcessingOptions {
  onProgress?: (progress: UploadProgress) => void;
}

export interface ObjectURLRuntime {
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
}

export interface ObjectURLPreview {
  readonly url: string;
  readonly revoked: boolean;
  revoke(): void;
}
