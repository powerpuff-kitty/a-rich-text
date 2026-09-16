# Editor presentation and next authoring tools

## Implemented presentation

Appearance and interaction are independent. Wrap a toolbar and editor in
`a-rich-text-shell` for one shared frame; the editable content has no default
border. `preset="default|minimal|document"` controls visual styling.

```html
<a-rich-text-shell>
  <a-rich-text-toolbar for="article" mode="traditional"></a-rich-text-toolbar>
  <a-rich-text id="article" preset="document" aria-label="Article"
    tools="paragraph heading bold italic link undo redo"
    views="visual html markdown json text"></a-rich-text>
</a-rich-text-shell>
```

`mode="traditional"` (the default) keeps available controls above the document.
`mode="inline"` shows the formatting toolbar near a text selection. Alt+F10 opens
it from the editor for keyboard users; Escape dismisses it. The document-format
menu remains available in the header. Both modes use the same commands, document,
selection, history and form integration. The inline mode is not a block editor.

The root [local showcase](http://127.0.0.1:8080/) offers appearance, toolbar mode,
tool sets, samples and optional highlighting. The component gallery has dedicated
examples. `tools` and `views` are developer-controlled allowlists; controls also
reflect the current selection, read-only state and command availability.

## Reusable dropdown

`a-rich-text-select` is registered with `@arichtext/web-component` and is used by
text style, document format and showcase settings. It renders light-DOM `option`
elements into a keyboard-operated popup in the browser top layer, flips above
when needed, clamps horizontally and repositions on scrolling/resizing.

```html
<a-rich-text-select label="Appearance" value="default">
  <option value="default">Default</option>
  <option value="minimal">Minimal</option>
  <option value="document">Document</option>
</a-rich-text-select>
```

Use `value`, `disabled`, `label`, `open()`, `close()` and the bubbling `change`
event. Options support `disabled` and `hidden`. Arrow keys, Home/End, typeahead,
Enter/Space, Escape and Tab work without a native select. The popup has a scroll
limit. Style `::part(trigger)` and `::part(menu)`; nested document selectors expose
`view-trigger` and `view-menu` on the toolbar/editor. This small control is not a
replacement for a searchable multiselect or a form-associated select: bind its
value explicitly when using it outside editor controls.

## Optional lightweight highlighting

```ts
const { enableCodeHighlighting } = await import('@arichtext/editor/highlight');
const highlighting = enableCodeHighlighting(editor);
// On integration teardown:
highlighting.destroy();
```

The standalone minified addon measures **1,702 bytes (933 bytes gzip)** in this
build; it is not included in the standard editor bundle. The dependency-free
addon decorates code blocks in the rendered view only. It
supports basic JS/TS, JSON and CSS token colors and has no grammar downloads.
Unknown languages and blocks over 100,000 characters remain plain text. This is
a small lexer, not a full syntax parser: template interpolation, JSX, regex
literals and language-specific semantic tokens are not parsed. Canonical HTML,
Markdown and ART JSON, history and form values remain unchanged. Code editing
continues through the existing code dialog. Colors are configurable with
`--art-code-keyword`, `--art-code-string`, `--art-code-number`, `--art-code-comment`.
The standalone distribution provides the separate `highlight.js` ESM file.

## Reference review and roadmap

Reviewed 2026-09-16 against the official documentation:

- Quill's [themes](https://quilljs.com/docs/customization/themes) distinguish a
  traditional Snow toolbar and contextual Bubble interface. That separation
  informs the two modes above; we retain our own engine and Web Components.
- Quill's [format list](https://quilljs.com/docs/formats) includes text/background
  color, font family/size, subscript/superscript, alignment/direction, formulas and
  video. Those controls are **not implemented here**. They require explicit schema,
  serialization and safe import/export decisions, not only toolbar buttons.
- Quill's [syntax module](https://quilljs.com/docs/modules/syntax) uses highlight.js.
  Our optional addon deliberately provides a smaller basic lexer; apps needing
  complete grammars should use a separate adapter, which is not supplied yet.
- [Editor.js](https://editorjs.io/) offers a block toolbox, inline tools and block
  settings. Our engine already stores blocks, but slash insertion, block handles,
  move/duplicate/delete menus and drag reordering are **not implemented**. ART JSON
  is our schema; it is not interchangeable with Editor.js output JSON.

Existing issues #4 (authoring) and #6 (extensions) were broad umbrellas; neither
specified a complete Notion-style interaction mode. Dedicated follow-up tickets
track block UX and additional formatting, linked below. These are planned work,
not promised release dates. Implement keyboard block movement and selection
semantics before pointer drag handles; preserve undo and review anchors throughout.

### Tracked follow-ups

- [Editor: block insertion menu and keyboard-first block controls](https://github.com/powerpuff-kitty/a-rich-text/issues/74).
- [Editor: additional text formatting and embedded-content contracts](https://github.com/powerpuff-kitty/a-rich-text/issues/75).
