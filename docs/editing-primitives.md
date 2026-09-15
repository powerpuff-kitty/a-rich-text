# Links, lists and tables

These optional packages build normal engine transactions. Apply them through `editor.dispatch()` after checking `editor.disabled` and `editor.readOnly`. The base Web Component keeps these capabilities out of its dependency graph; `@arichtext/ui` includes their toolbar controls.

```ts
import { toggleList } from '@arichtext/lists';

const state = { document: editor.getJSON(), selection: editor.getSelection() };
const command = toggleList(state, 'bullet');
if (!editor.disabled && !editor.readOnly && command) editor.dispatch(command);
```

## Links

`@arichtext/links` provides `setSelectionLink`, `removeSelectionLink`, `getActiveLinkHref`, `normalizeLinkHref` and `detectLinks`. Link creation/removal currently requires a non-collapsed selection. Unsafe protocols are rejected. Detection is a separate helper and does not mutate the document.

The toolbar includes a Link control with URL entry, Apply, Remove and Cancel. Collapsed-caret link creation and the Mod+K host flow remain follow-up work.

## Lists

`@arichtext/lists` provides `toggleList`, `setListStyle`, `setTaskItemChecked`, `getActiveList` and `insertListParagraph`.

- Toggling outside a list wraps the current paragraph/heading.
- Toggling the same style unwraps the closest list; a different style converts it.
- Enter splits a single paragraph/heading item into sibling items, preserving inline marks. A new task item starts unchecked.
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

Multi-block list items and cross-block selections are not split by this command. The adapter prevents native mutation for unsupported list Enter and emits `list-editing-unsupported` with `{ inputType }`. Without the adapter, the base engine splits paragraphs within their existing container. Indent/outdent and list-boundary Backspace policy remain follow-up work.

## Tables

`@arichtext/tables` provides `insertTable`, `getActiveTable`, `addTableRow`, `removeCurrentTableRow`, `addTableColumn` and `removeCurrentTableColumn`. The toolbar inserts a 2 × 2 table and offers contextual row/column controls.

Commands preserve rectangular tables, use explicit mappings for surviving cells and are undoable. Insertion accepts configurable dimensions at a single-block selection; merged-cell editing is rejected. Removing the last row or column is a no-op. Merged-cell editing and cell-navigation helpers remain follow-up work.

## Evidence

Engine tests cover nested paths, annotations, selection replacement, ordered numbering, marks and task state. Adapter tests cover cancellation, composition, readonly/disabled state, disposal and undo/redo. Browser tests exercise typing, toolbar actions, list Enter/exit, table dimensions and undo on the built packages. See [compatibility](compatibility.md) for measured targets and manual checks still outstanding.
