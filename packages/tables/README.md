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

`mergeTableCellRight(state)` appends the right cell's blocks to the active cell
and combines their column spans. `splitTableCell(state)` retains content in the
left cell and adds empty unit cells. Both preserve review-anchor mappings and
are undoable. `getTableCellActions(state)` reports contextual availability.
These commands and Tab navigation support horizontal spans; vertical spans and
column changes to merged grids remain unsupported. Row insertion/removal supports
horizontal spans; `getTableRowActions(state)` reports availability. HTML/JSON preserve spans;
Markdown/plain text do not.
