# Editing engine

`@arichtext/engine` is the DOM-independent editing layer for A Rich Text. It operates directly on ART documents and can be used in browsers, workers, Node tooling, tests or custom rendering environments.

## State and selections

Selections use a path to a paragraph/heading block plus a character offset across that block's inline text.

```ts
import {
  createEditorState,
  textPoint,
  textSelection,
} from '@arichtext/engine';

const state = createEditorState(document, textSelection(
  textPoint([0], 0),
  textPoint([0], 5),
));
```

The path addresses nested ART content arrays. For example:

- `[0]` — first top-level paragraph/heading
- `[0, 0, 0]` — paragraph inside the first item of a top-level list
- `[0, 0, 0, 0]` — paragraph inside the first cell of the first row of a top-level table

Selections do **not** point to individual text nodes. Formatting may split/merge text runs without invalidating the block-relative character offsets.

## Transactions

```ts
import { applyTransaction, transaction } from '@arichtext/engine';

const result = applyTransaction(
  state,
  transaction()
    .toggleMark(
      textPoint([0], 0),
      textPoint([0], 5),
      { type: 'bold' },
    )
    .build(),
);
```

Operations are applied atomically to a cloned ART document. Invalid paths/ranges throw without mutating the input state.

Initial operations:

- replace/insert/delete inline text
- add/remove/toggle inline marks
- paragraph ↔ heading block type
- explicit selection update
- transaction metadata

A text replacement spanning multiple blocks removes the selected text but deliberately preserves block structure. Joining/splitting blocks is a separate structural-editing concern.

## Stateful engine + history

```ts
import { EditorEngine, createEditorState } from '@arichtext/engine';

const engine = new EditorEngine(createEditorState(document), {
  historyLimit: 100,
});

engine.dispatch(transaction().setSelection(selection));
engine.dispatch(transaction().replaceText(selection.anchor, selection.head, 'Hello'));

engine.undo();
engine.redo();
```

Undo/redo restores both document and selection. Selection-only transactions do not consume history entries.

## Command helpers

High-level selection commands live in a separate tree-shakeable subpath:

```ts
import { EditorEngine } from '@arichtext/engine';
import {
  insertText,
  toggleSelectionMark,
  setCurrentHeading,
} from '@arichtext/engine/commands';

const command = toggleSelectionMark(engine.state, { type: 'bold' });
if (command) engine.dispatch(command);
```

This keeps the lower-level transaction layer usable without pulling in convenience APIs.

## DOM integration

The engine intentionally has no DOM dependency. `<a-rich-text>` will map DOM selections and input events to engine transactions and render resulting ART state back to the editable surface.

The planned browser adapter must handle `beforeinput`, composition/IME, selection direction, browser spellcheck/autocorrect and clipboard behavior without making mutated HTML the canonical state.
