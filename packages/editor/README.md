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
The controller exposes `setLink`, `removeLink`, `toggleList`, `setTaskChecked`,
`insertTable`, `removeTable`, `mergeCellRight`, `mergeCellBelow` and `splitCell` convenience commands. Initialization requires a browser DOM.

ES modules with TypeScript declarations. MIT licensed. No mandatory hosted service.

This package is part of [A Rich Text](https://github.com/powerpuff-kitty/a-rich-text).
See the repository's [integration guide](https://github.com/powerpuff-kitty/a-rich-text/blob/main/docs/getting-started.md) for local installation and the standard editor.
Exported API declarations are included in `dist/`. Version 0.0.0 is a development snapshot; it is not a stable public release.

Image authoring uses `openImageEditor()` and the optional `imageUploader` property.
See [image integration](https://github.com/powerpuff-kitty/a-rich-text/blob/main/docs/image-authoring.md)
for previews, upload cancellation, formats and custom styling.

Standard editing automatically links completed URL/email tokens when a space is
typed. Set `autolink="false"` or disable the `link` tool to opt out. Existing links,
inline code, composition, imports and paste are not automatically rewritten.

## Screenshot

![Standard editor](../../docs/screenshots/standard-editor.png)

[Complete component gallery](../../docs/component-gallery.md).

Wrap toolbar and editor in `<a-rich-text-shell>` for one shared frame. Set
`mode="inline"` on the toolbar for contextual formatting. Optional basic code
highlighting is exported separately from `@arichtext/editor/highlight`; call
`enableCodeHighlighting(editor)` and dispose its returned controller on teardown.

Set `source-update="auto"` with allowed `views` to apply valid source edits after a
pause, preserving invalid drafts. Manual Apply remains the default. Optional
`@arichtext/editor/format` exports a Prettier `formatSource` hook to assign to
`editor.sourceFormatter`. `detectInputFormat(source)` suggests a format without
mutating content or treating foreign JSON as importable.
See [source editing](https://github.com/powerpuff-kitty/a-rich-text/blob/main/docs/editor-configuration.md#automatic-source-updates-and-formatting)
and the [format catalogue](https://github.com/powerpuff-kitty/a-rich-text/blob/main/docs/editor-formats.md).
