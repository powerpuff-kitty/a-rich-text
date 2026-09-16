# @arichtext/web-component

Native <a-rich-text> Web Component for framework-independent rich text editing.

ES modules with TypeScript declarations. MIT licensed. No mandatory hosted service.

This package is part of [A Rich Text](https://github.com/powerpuff-kitty/a-rich-text).
See the repository's [integration guide](https://github.com/powerpuff-kitty/a-rich-text/blob/main/docs/getting-started.md) for local installation and the standard editor.
Exported API declarations are included in `dist/`. Version 0.0.0 is a development snapshot; it is not a stable public release.

Image authoring uses `openImageEditor()` and the optional `imageUploader` property.
See [image integration](https://github.com/powerpuff-kitty/a-rich-text/blob/main/docs/image-authoring.md)
for previews, upload cancellation, formats and custom styling.

Use `preset="default"`, `preset="minimal"` or `preset="document"` for optional appearance defaults.
See [presets and styling overrides](https://github.com/powerpuff-kitty/a-rich-text/blob/main/docs/customization.md#appearance-presets).

## Screenshot

![Base Web Component](../../docs/screenshots/base-editor.png)

[Complete component gallery](../../docs/component-gallery.md).

The base package also registers `<a-rich-text-select>`, a small keyboard-operated
viewport-aware dropdown. `value`, `disabled` and `label` attributes, light-DOM
`option` elements and bubbling `change` events form its API. The optional UI
package provides `<a-rich-text-shell>` for a shared toolbar/content frame.

Set `source-update="auto"` with allowed `views` to apply valid source edits after a
pause, preserving invalid drafts. Manual Apply remains the default. Optional
`@arichtext/editor/format` exports a Prettier `formatSource` hook to assign to
`editor.sourceFormatter`. `detectInputFormat(source)` suggests a format without
mutating content or treating foreign JSON as importable.
See [source editing](https://github.com/powerpuff-kitty/a-rich-text/blob/main/docs/editor-configuration.md#automatic-source-updates-and-formatting)
and the [format catalogue](https://github.com/powerpuff-kitty/a-rich-text/blob/main/docs/editor-formats.md).

Short tags are registered alongside the existing names: `art-editor` and
`art-select` in the base package; `art-toolbar` and `art-shell` in the UI package.
The standard editor imports both. [Alias examples](https://github.com/powerpuff-kitty/a-rich-text/blob/main/docs/getting-started.md#short-tag-aliases).
