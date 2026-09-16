# Optional UI package

The base `<a-rich-text>` editor does not require a toolbar. `@arichtext/ui` provides framework-independent Web Component controls for applications that want a ready-made interface.

## Standard toolbar

```html
<a-rich-text-shell>
  <a-rich-text-toolbar for="editor"></a-rich-text-toolbar>
  <a-rich-text id="editor" name="body" aria-label="Document"></a-rich-text>
</a-rich-text-shell>

<script type="module">
  import '@arichtext/web-component';
  import '@arichtext/ui';
</script>
```

The first toolbar includes:

- paragraph / H1 / H2 / H3
- bold
- italic
- underline
- strikethrough
- link entry/removal with validation feedback
- bullet, numbered and task lists
- table insertion and contextual row/column controls
- undo
- redo

The toolbar calls the public engine-backed editor API. It never uses `document.execCommand` and does not parse the editor DOM to determine formatting state.

List-aware Enter requires the optional `@arichtext/lists-editor` adapter. See [editing primitives](editing-primitives.md) for command APIs and current boundaries.

## Programmatic binding

A toolbar can bind without DOM ids:

```ts
const toolbar = document.querySelector('a-rich-text-toolbar');
const editor = document.querySelector('a-rich-text');

toolbar.editor = editor;
```

This is useful inside component frameworks or nested shadow roots where document-level ids are inconvenient.

## Editor query / command API

```ts
editor.getSelection();
editor.getActiveMarks();
editor.isMarkActive('bold');
editor.getActiveBlock();

editor.toggleMark('bold');
editor.toggleMark('italic');
editor.setParagraph();
editor.setHeading(2);

editor.canUndo;
editor.canRedo;
editor.undo();
editor.redo();
```

The API is intentionally small so custom design systems can build their own controls without depending on `@arichtext/ui`.

## Keyboard shortcuts

The editor currently handles:

| Shortcut | Action |
| --- | --- |
| Mod+B | Bold |
| Mod+I | Italic |
| Mod+U | Underline |
| Mod+Z | Undo |
| Mod+Shift+Z | Redo |
| Ctrl+Y | Redo |

`Mod` means Command on macOS and Control on other common desktop platforms. Shortcuts are disabled while the editor is readonly/disabled and while composition is active.

## Accessibility

The toolbar uses:

- `role="toolbar"`
- accessible names on every control
- `aria-pressed` on toggle formatting buttons
- actual disabled state for unavailable/readonly controls
- a labelled native `<select>` for text style
- visible `:focus-visible` outlines

Pointer-down on toolbar buttons prevents focus theft so clicking a formatting control does not discard the editor selection. After a successful action the editor is refocused and restores its logical engine selection.

## Styling

The toolbar exposes CSS custom properties:

```css
a-rich-text-toolbar {
  --art-toolbar-font: inherit;
  --art-toolbar-background: Canvas;
  --art-toolbar-color: CanvasText;
  --art-toolbar-active: color-mix(in srgb, CanvasText 12%, transparent);
  --art-toolbar-radius: 0.375rem;
}
```

And Shadow DOM parts including:

- `toolbar`
- `button`
- `bold-button`
- `italic-button`
- `underline-button`
- `strike-button`
- `undo-button`
- `redo-button`
- `block-select`
- `separator`

## Shared chrome and contextual mode

Wrap the toolbar and editor in `<a-rich-text-shell>` for one frame. Style its
`--art-shell-border`, `--art-shell-radius`, `--art-shell-background` and
`--art-shell-shadow`; the content and toolbar no longer have separate default borders.
Use `mode="inline"` on the toolbar for selection-based formatting.
The text-style selector and document-format switcher use `<a-rich-text-select>`.
See [modes, dropdown API and optional highlighting](editor-modes.md).
