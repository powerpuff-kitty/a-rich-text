# @arichtext/tables

Deterministic table insertion and row/column commands for A Rich Text

ES modules with TypeScript declarations. MIT licensed. No mandatory hosted service.

This package is part of [A Rich Text](https://github.com/powerpuff-kitty/a-rich-text).
See the repository's [integration guide](https://github.com/powerpuff-kitty/a-rich-text/blob/main/docs/getting-started.md) for local installation and the standard editor.
Exported API declarations are included in `dist/`. Version 0.0.0 is a development snapshot; it is not a stable public release.

`removeCurrentTable(state)` removes the containing table at a single text-block
selection and leaves an empty paragraph in its place. One Undo restores all
content, including imported merged cells. Selections outside tables or spanning
multiple text blocks return `null`. Hosts enforce readonly/disabled state.
