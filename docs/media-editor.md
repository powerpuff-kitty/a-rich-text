# Image editor adapter

`@arichtext/media-editor` connects the low-level browser media pipeline to `<a-rich-text>` without adding image processing or upload code to the base editor bundle.

## Already-hosted images

If an application already has an asset URL, no upload provider is required:

```ts
import { insertImageBlock } from '@arichtext/media-editor';

insertImageBlock(editor, {
  src: 'https://cdn.example.com/photo.webp',
  alt: 'A descriptive alternative',
  width: 1280,
  height: 720,
});
```

The image is inserted as an ART block through a normal engine transaction. The current paragraph/heading is split around the image and the insertion is undoable.

Unsafe URL protocols are rejected before ART is mutated.

## Attach application-owned uploading

```ts
import { attachImageMedia } from '@arichtext/media-editor';

const media = attachImageMedia(editor, {
  provider: myUploadProvider,
  processing: {
    process: true,
    outputMaxWidth: 1920,
    outputMaxHeight: 1920,
    outputType: 'image/webp',
    quality: 0.82,
  },
  alt(file) {
    return '';
  },
  onProgress(progress) {
    console.log(progress.fraction);
  },
});
```

By default the controller captures:

- image files pasted from the clipboard,
- image files dropped onto the editor,
- programmatic `insertFile()` calls,
- the optional native file picker through `pickImage()`.

Text/HTML paste remains handled by the normal clipboard package.

## Programmatic insertion task

```ts
const task = media.insertFile(file);

// Optional cancellation:
task.cancel();

const { image, upload, transaction } = await task.promise;
```

The task exposes its own `AbortSignal`. Provider upload cancellation is propagated through the shared media contract.

## Selection and stale-document safety

The controller captures the logical ART selection before processing/upload begins.

It also captures a deterministic serialization of the document. If the document changes while the upload is running, the uploaded image is **not** inserted at a potentially stale path.

Instead the task rejects with:

```ts
error.code === 'document-changed'
error.uploadResult
```

The upload result is retained on the error so the host can delete an orphaned object or offer the user a retry/reinsert action.

Selection-only movement does not trigger the stale-document guard; if the document itself is unchanged, the image is inserted at the originally captured location.

A future placeholder-node workflow can support concurrent editing while long uploads run without sacrificing deterministic positioning.

## Events

The adapter dispatches composed events from the editor:

- `media-upload-progress`
- `media-upload-complete`
- `media-upload-error`

Equivalent callbacks can be supplied in `MediaEditorOptions`.

## Paste/drop interception

The adapter only intercepts paste/drop when an image `File` is present. It uses capture-phase listeners so image files can be claimed before the base textual clipboard fallback processes the event.

The initial implementation inserts dropped images at the current logical editor selection. Pointer-coordinate drop placement is a separate follow-up because it requires browser caret-point mapping across shadow DOM.

## Cleanup

```ts
media.destroy();
```

Destroying the controller:

- removes paste/drop listeners,
- aborts active upload tasks,
- prevents new insertion tasks.

## Bundle boundary

`@arichtext/web-component` does **not** depend on `@arichtext/media` or `@arichtext/media-editor`.

Applications that only need text editing never download image processing/upload orchestration code.
