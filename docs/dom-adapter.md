# DOM adapter

`@arichtext/dom` bridges ART/engine state to browser editing surfaces without making HTML the canonical document model.

It is intentionally separate from `@arichtext/engine`: the engine remains usable in Node, workers and non-DOM renderers.

## Safe rendering

```ts
import { renderARTDocument } from '@arichtext/dom';

renderARTDocument(editableElement, engine.state.document);
```

The renderer constructs elements and text nodes with DOM APIs. Document text is assigned as text, never evaluated as raw HTML.

Supported ART blocks are rendered recursively. Paragraph/heading blocks receive internal attributes containing their engine block path. Links and images pass through protocol allowlists before URL attributes are created.

## Logical selection model

```ts
import {
  readDOMSelection,
  writeDOMSelection,
} from '@arichtext/dom';

const selection = readDOMSelection(editableElement);
if (selection) {
  engine.dispatch(transaction().setSelection(selection));
}

writeDOMSelection(editableElement, engine.state.selection!);
```

A DOM selection is converted to:

```ts
{
  anchor: { blockPath: [0], offset: 2 },
  head: { blockPath: [0], offset: 8 }
}
```

Offsets are character offsets across an ART paragraph/heading, independent of how many DOM elements are required for bold/italic/link/code marks.

Rendered `<br>` nodes count as one logical newline character. Anchor/focus direction is retained so backwards selections can round-trip.

## Nested blocks

Block paths follow ART content arrays:

- top-level paragraph: `[0]`
- paragraph in first list item: `[0, 0, 0]`
- paragraph in first table cell: `[0, 0, 0, 0]`

The DOM attributes are implementation details of the editing surface; they are not emitted by public HTML export.

## `beforeinput` policy

`classifyBeforeInput()` translates browser input types into explicit intents and indicates whether the current engine can safely intercept them.

Currently safe to intercept:

- plain/replacement text insertion
- line breaks within a text block
- delete-by-cut/drag when there is a selection
- undo/redo
- bold/italic/underline/strike format intents

Currently **not** intercepted:

- composition/IME mutations
- paste/drop payloads
- paragraph/list structural changes
- collapsed backward/forward/word deletion
- unknown input types

Unsupported input is never marked as supported merely because the browser can mutate `contenteditable`. Dedicated reconciliation/structural operations must be implemented first.

## Security boundary

The DOM renderer is for trusted ART documents that already passed ART validation. It still treats URL-bearing fields defensively. Arbitrary external HTML must go through `@arichtext/html` import/sanitization before becoming ART.
