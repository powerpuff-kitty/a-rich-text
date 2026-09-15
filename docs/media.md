# Browser-first media

`@arichtext/media` keeps image validation, inspection, optional resizing/re-encoding and upload orchestration on the user device. It does not require A Rich Text Cloud or any particular storage vendor.

## Validate and inspect

```ts
import { inspectImage } from '@arichtext/media';

const info = await inspectImage(file, {
  allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
  maxBytes: 10 * 1024 * 1024,
  maxPixels: 24_000_000,
  maxWidth: 8000,
  maxHeight: 8000,
});
```

Encoded MIME/byte checks happen before decode. Pixel/dimension constraints are checked immediately after decode and before processing canvas allocation.

File extensions are not trusted. An empty or disallowed MIME type is rejected.

## Keep the original

Processing is opt-in:

```ts
import { prepareImage } from '@arichtext/media';

const image = await prepareImage(file);
```

This validates/decodes the source but returns the original `Blob`/`File` unchanged.

This is the safe default for formats where re-encoding could be lossy or destructive, such as animated images.

## Resize and re-encode in the browser

```ts
const image = await prepareImage(file, {
  process: true,
  outputMaxWidth: 1920,
  outputMaxHeight: 1920,
  outputType: 'image/webp',
  quality: 0.82,
});
```

Processing:

1. validates the encoded source,
2. decodes it with browser image APIs,
3. checks decoded dimensions/pixel count,
4. computes a contain resize without upscaling,
5. renders to `OffscreenCanvas` where available or a normal canvas fallback,
6. creates a fresh encoded Blob.

A canvas re-encode writes a new pixel asset rather than forwarding source file metadata bytes. Browser decode APIs are used with image-orientation handling where supported.

Supported requested encoder types are JPEG, PNG and WebP. If the original type is not one of those and processing is requested without an explicit output type, WebP is used.

## Cancellation

```ts
const controller = new AbortController();

prepareImage(file, {
  process: true,
  signal: controller.signal,
});

controller.abort();
```

Abort state is checked before/after decode and between processing stages. Browser primitives that cannot be synchronously cancelled are discarded as soon as they settle.

## Application-owned uploads

Implement one small provider contract:

```ts
import type { ImageUploadProvider } from '@arichtext/media';

const provider: ImageUploadProvider = {
  async upload(image, { signal, onProgress }) {
    // Upload image.blob to your API, R2, S3, Supabase, etc.
    // Call onProgress({ loaded, total }) when useful.

    return {
      url: 'https://cdn.example.com/image.webp',
      id: 'asset-123',
    };
  },
};
```

Then:

```ts
import { uploadImage } from '@arichtext/media';

const { image, result } = await uploadImage(file, provider, {
  process: true,
  outputMaxWidth: 1920,
  outputType: 'image/webp',
  quality: 0.82,
  onProgress(progress) {
    console.log(progress.fraction);
  },
});
```

The package does not hide retries. The host application decides retry policy, credentials, signed URLs, resumable uploads and storage semantics.

## Local previews

```ts
import { createObjectURLPreview } from '@arichtext/media';

const preview = createObjectURLPreview(image.blob);
img.src = preview.url;

// When no longer needed:
preview.revoke();
```

`revoke()` is idempotent so UI cleanup can safely call it more than once.

## Error model

`MediaError` exposes stable codes including:

- `unsupported-type`
- `file-too-large`
- `decode-unavailable`
- `decode-failed`
- `dimensions-too-large`
- `pixels-too-large`
- `processing-unavailable`
- `encode-failed`
- `aborted`
- `upload-failed`
- `invalid-upload-result`

## Editor integration boundary

This package deliberately does not mutate an ART document. The next layer will use it for image paste/drop/file-picker UX and insert the final uploaded asset URL through an explicit ART image transaction.
