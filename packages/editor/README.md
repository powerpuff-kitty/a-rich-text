# @arichtext/editor

Ready-to-use rich text editor with toolbar, list and table keyboard behavior

```ts
import { enableStandardEditing } from '@arichtext/editor';
const editor = document.querySelector('a-rich-text');
const controller = enableStandardEditing(editor);
editor.setHTML('<p>Hello</p>');
// Dispose when your integration is permanently removed:
// controller.destroy();
```

Add `<a-rich-text-toolbar for="body"></a-rich-text-toolbar>` and
`<a-rich-text id="body" name="body" aria-label="Body"></a-rich-text>` to your form.
The controller exposes `setLink`, `removeLink`, `toggleList`, `setTaskChecked`
and `insertTable` convenience commands. Initialization requires a browser DOM.

ES modules with TypeScript declarations. MIT licensed. No mandatory hosted service.

This package is part of [A Rich Text](https://github.com/powerpuff-kitty/a-rich-text).
See the repository's [integration guide](https://github.com/powerpuff-kitty/a-rich-text/blob/main/docs/getting-started.md) for local installation and the standard editor.
Exported API declarations are included in `dist/`. Version 0.0.0 is a development snapshot; it is not a stable public release.

Image authoring uses `openImageEditor()` and the optional `imageUploader` property.
See [image integration](https://github.com/powerpuff-kitty/a-rich-text/blob/main/docs/image-authoring.md)
for previews, upload cancellation, formats and custom styling.
