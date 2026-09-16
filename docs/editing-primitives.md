# Links, lists and tables

These optional packages build normal engine transactions. Apply them through `editor.dispatch()` after checking `editor.disabled` and `editor.readOnly`. The base Web Component keeps these capabilities out of its dependency graph; `@arichtext/ui` includes their toolbar controls.

```ts
import { toggleList } from '@arichtext/lists';

const state = { document: editor.getJSON(), selection: editor.getSelection() };
const command = toggleList(state, 'bullet');
if (!editor.disabled && !editor.readOnly && command) editor.dispatch(command);
```

## Links

`@arichtext/links` provides `setSelectionLink`, `removeSelectionLink`, `getActiveLinkHref`, `normalizeLinkHref` and `detectLinks`. These transaction helpers require a non-collapsed selection. The Web Component also provides `setMark(createLinkMark(href))` and `removeMark('link')` for caret typing. Unsafe protocols are rejected. Detection is a separate helper and does not mutate the document.

The toolbar includes a Link control with URL entry, Apply, Remove and Cancel. Mod+K opens the control for selected text or a caret. At a caret, Apply/Remove changes subsequent typing.

## Lists

`@arichtext/lists` provides `toggleList`, `setListStyle`, `setTaskItemChecked`, `getActiveList`, `insertListParagraph`, `indentListItem` and `outdentListItem`.

- Toggling outside a list wraps the current paragraph/heading.
- Toggling the same style unwraps the closest list; a different style converts it.
- Enter splits a paragraph/heading into sibling items, preserving inline marks and moving trailing blocks into the new item. A new task item starts unchecked.
- Enter on an empty item exits into a paragraph in the containing block array. Items before/after it remain lists; ordered numbering continues from its original position.
- Selection deletion, text splitting and structural movement form one undoable transaction. Explicit path mappings preserve review anchors in surviving content.

Install the keyboard adapter once per editor:

```ts
import { enableListEditing } from '@arichtext/lists-editor';

const lists = enableListEditing(editor);
// When the integration is disposed:
lists.destroy();
```

The adapter respects readonly/disabled state, composition, already-cancelled input and non-cancelable native events. It captures `insertParagraph` before the base handler. Repeated installation returns the existing controller; `destroy()` is idempotent.

Cross-block selections and paragraphs inside other nested containers are not split by this command. The adapter prevents native mutation for unsupported list Enter and emits `list-editing-unsupported` with `{ inputType }`. Without the adapter, the base engine splits paragraphs within their existing container. Tab indents under the preceding item; Shift+Tab lifts one level. Backspace at the first block’s start lifts the item without deleting its text. At the outer level only the current item is extracted into ordinary blocks.

## Tables

`@arichtext/tables` provides `insertTable`, `getActiveTable`, `addTableRow`, `removeCurrentTableRow`, `addTableColumn`, `removeCurrentTableColumn`, `removeCurrentTable`, `mergeTableCellRight`, `splitTableCell`, `getTableCellActions` and `moveTableCell`. The toolbar inserts a 2 × 2 table and offers contextual row/column, horizontal merge/split and whole-table removal controls.

Commands preserve rectangular tables, use explicit mappings for surviving cells and are undoable. Insertion accepts configurable dimensions at a single-block selection. Row/column operations require unmerged grids. Removing the last row or column is a no-op. `moveTableCell` navigates in row order without adding an undo step. The standard `@arichtext/editor` controller binds Tab/Shift+Tab and permits focus to leave at table edges. Horizontal merge appends the right cell’s content blocks; split retains all content on the left and inserts empty unit cells. Tab traverses physical cells including horizontal spans. Vertical spans remain unsupported for merge/split and navigation. Whole-table removal works with imported spans and leaves an editable paragraph. HTML/JSON preserve spans; Markdown/plain text do not.

## Evidence

Engine tests cover nested paths, annotations, selection replacement, ordered numbering, marks and task state. Adapter tests cover cancellation, composition, readonly/disabled state, disposal and undo/redo. Browser tests exercise typing, toolbar actions, list Enter/exit, table dimensions and undo on the built packages. See [compatibility](compatibility.md) for measured targets and manual checks still outstanding.
