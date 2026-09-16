# Images and optional uploads

The `image` tool enables **Insert image** at a paragraph/heading selection and
**Edit image** on existing images, including nested imported images. Omit `tools`
to enable all tools, or include `image` in your allowlist. Custom buttons can call
`editor.openImageEditor()` to insert, or `editor.openImageEditor([0])` to edit an
image at an ART block path. The method returns whether the dialog opened.

The dialog accepts an HTTP(S), relative or blob URL, alternative text, optional
title and positive whole-number dimensions. Alternative text is required unless
the author explicitly selects **Decorative image**. URL previews load only when
requested. File previews use temporary local object URLs. Blob URLs are temporary;
use a hosted URL for persistent documents. Data URLs are not accepted by this UI.

Apply creates one undoable change. Remove replaces the image with an editable
paragraph. Cancel/Escape discards the draft. Draft changes and upload completion
do not change canonical content or form values until Apply. A concurrent document
update prevents applying a stale draft. Readonly/disabled state, tool removal,
source-view changes, form reset and disconnection close the dialog and cancel
pending uploads. Late upload results are ignored and local previews are revoked.

## Supply an uploader

Upload controls appear only when the host assigns `imageUploader`. This is a
JavaScript property, not an HTML attribute; the base component has no storage
backend or dependency on the optional media packages.

```ts
import { uploadImage } from '@arichtext/media';
import type { ImageUploadProvider } from '@arichtext/media';
import type { ARichTextElement } from '@arichtext/web-component';

export function configureImages(
  editor: ARichTextElement,
  provider: ImageUploadProvider,
) {
  editor.imageUploader = async (file, { signal, onProgress }) => {
    const { image, result } = await uploadImage(file, provider, {
      signal, onProgress,
    });
    return {
      src: result.url,
      width: result.width ?? image.width,
      height: result.height ?? image.height,
    };
  };
}
```

You can instead implement the callback using your own transport. Return a promise
of `{ src, width?, height? }`, honor the abort signal and report optional progress
with `onProgress({ loaded, total })`. Throw on failure; the dialog retains the file
for retry. The callback must return image metadata without inserting content.
Set `imageUploader = undefined` to remove upload controls and cancel pending work.

The file picker accepts PNG, JPEG, WebP, GIF and AVIF. File type filtering is a UI
convenience; the host/provider remains responsible for validation, processing,
size limits and storage. The optional media package provides processing and
validation; the optional media-editor adapter separately provides paste/drop and
direct insertion. The host owns cleanup of uploaded assets when a draft is
discarded; cancelling a request cannot guarantee a storage rollback.

## Formats and styling

ART JSON preserves image fields. Supported HTML preserves source, alternative
text, title and dimensions; Markdown preserves source, alternative text and
title but not dimensions. Plain text drops image structure. Editor controls and
wrappers are excluded from exported content and DOM reconciliation.

Use the image CSS parts listed in [customization](customization.md) for dialog,
preview and button styling. A Vue-specific editor is unnecessary; configure the
same element property through the optional wrapper's element reference.
