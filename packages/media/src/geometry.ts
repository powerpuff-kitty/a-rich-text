export interface ImageSize {
  width: number;
  height: number;
}

/** Fit an image within optional bounds without upscaling. */
export function containImageSize(
  width: number,
  height: number,
  maxWidth?: number,
  maxHeight?: number,
): ImageSize {
  assertDimension(width, 'width');
  assertDimension(height, 'height');
  if (maxWidth !== undefined) assertDimension(maxWidth, 'maxWidth');
  if (maxHeight !== undefined) assertDimension(maxHeight, 'maxHeight');

  const widthScale = maxWidth === undefined ? 1 : maxWidth / width;
  const heightScale = maxHeight === undefined ? 1 : maxHeight / height;
  const scale = Math.min(1, widthScale, heightScale);

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function assertDimension(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive finite number`);
  }
}
