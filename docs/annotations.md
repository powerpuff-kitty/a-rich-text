# Anchored ranges

Comments, suggestions and review workflows cannot safely store browser `Range` objects or static DOM offsets.

A Rich Text uses **ART-relative anchored ranges** that can be mapped through editor transactions.

`@arichtext/annotations` is DOM- and framework-independent.

## Range model

```ts
import {
  createAnchoredRange,
} from '@arichtext/annotations';

const range = createAnchoredRange(
  editor.getJSON(),
  editor.getSelection(),
  {
    captureQuote: true,
  },
);
```

An anchored point contains:

```ts
{
  blockPath: [0],
  offset: 6,
  affinity: 'after',
}
```

A range contains normalized document-order `start` and `end` points.

## Why affinity exists

Consider a comment anchored to `world`:

```text
hello world
      ^---^
```

If another user inserts `big ` exactly at the comment start:

```text
hello big world
```

The original comment should normally continue to refer to `world`, not grow to include `big `.

The default comment-style affinities are therefore:

```text
start: after
end:   before
```

At a **pure insertion** exactly on an anchor:

- `before` stays before inserted content;
- `after` moves after inserted content.

For a non-empty replacement, the replacement boundaries map around the replacement. A range that exactly covered replaced text therefore follows the replacement.

## Collapsed ranges

A collapsed range defaults both endpoints to `after` affinity so a single caret anchor cannot invert when text is inserted at its position.

Applications can override affinities explicitly for specialized semantics.

## Quote snapshots

Optional quote capture stores creation-time diagnostics:

```ts
{
  text: 'world',
  prefix: 'lo ',
  suffix: '...',
}
```

The quote is **not** the canonical position.

It is useful for:

- review UI previews;
- diagnostics;
- orphan recovery tools;
- human confirmation after a complex migration.

Mapping does not rewrite the creation-time quote when document text changes.

## Map through an operation

```ts
import {
  mapAnchoredRangeThroughOperation,
} from '@arichtext/annotations';

const result = mapAnchoredRangeThroughOperation(
  beforeDocument,
  range,
  operation,
);
```

Possible results:

```text
mapped
collapsed
orphaned
```

### `mapped`

Both anchors still identify a non-empty logical range.

### `collapsed`

Both anchors map to the same ART text point, usually because all anchored text was deleted.

A comment system can choose whether a collapsed comment remains visible, becomes detached or asks the user to re-anchor it.

### `orphaned`

The mapper cannot justify a valid post-operation location.

It returns `orphaned` instead of guessing.

This fail-closed behavior is important for review correctness.

## Supported engine operations

The first mapper understands every current `EditorOperation`:

```text
replaceText
replaceFragment
addMark
removeMark
toggleMark
setBlockType
splitBlock
joinBlocks
```

Formatting-only operations do not move positions.

## Text replacement

Same-block replacement maps offsets relative to the removed/inserted lengths.

A range covering:

```text
hello [world]
```

and a replacement:

```text
world → earth
```

maps to:

```text
hello [earth]
```

Deleting the entire selected text maps the range to a collapsed point.

## Paragraph splitting

For:

```text
abc|def
```

splitting at `|` creates two block paths.

Anchors before the split stay in the left block. Anchors after the split move into the new right sibling and have the split offset subtracted.

An anchor exactly on the split uses its affinity:

```text
before → end of left block
after  → start of right block
```

Sibling block paths after the split are incremented, including text blocks nested inside list/table/container siblings.

## Joining blocks

When adjacent text blocks join:

```text
abc
[def]
```

anchors in the right block move into the left block with the old left-block text length added to their offsets.

Following sibling paths shift down by one.

The mapper uses the same-parent/adjacent constraints as the engine and never crosses arbitrary container boundaries.

## Fragment insertion / paste

`replaceFragment` may replace one paragraph/heading with multiple ART blocks.

The mapper derives the post-operation document through the engine itself and maps:

- preserved text before the fragment to the first preserved block;
- preserved trailing text to the block containing the engine's resulting caret;
- sibling paths by the actual parent child-count delta.

This keeps comment anchors consistent with the same fragment semantics used by rich paste and image insertion.

## Full transaction mapping

```ts
mapAnchoredRangeThroughTransaction(
  beforeDocument,
  range,
  transaction,
);
```

Operations are mapped sequentially in the same order the engine applies them.

For an already-applied result:

```ts
mapAnchoredRangeThroughResult(
  beforeDocument,
  range,
  transactionResult,
);
```

The result helper replays the reported operations and verifies the reconstructed document equals `transactionResult.state.document`.

If it does not, the annotation is returned as `orphaned`.

This protects annotations when future engine behavior changes without a corresponding mapper update.

## Nested structures

Text points remain the same block-relative path model used by the editor engine:

```text
[0]          top-level paragraph
[0,0,0]      paragraph inside list item
[1,0,0,0]    paragraph inside table cell
```

Sibling shifts are applied at the affected parent depth rather than assuming all documents are flat.

## Storage guidance

A comment/review record should persist the anchored range plus its own domain metadata:

```ts
{
  id: 'thread-123',
  anchor: range,
  ...
}
```

Do not store DOM selectors as the primary comment location.

Do not insert arbitrary comment spans into exported document HTML merely to preserve review state.

Review records can be persisted/synchronized independently while their anchors map through the same canonical editor transactions.

## Collaboration

The collaboration transport layer and the anchor mapper solve different problems:

- `@arichtext/collaboration` transports document/presence state;
- `@arichtext/annotations` explains how review locations move when engine operations edit the document.

A future concurrent/CRDT adapter can supply provider-specific operation mapping where required, but comments should still expose ART-relative anchors to the application.

## Current boundaries

The current engine operation set is completely mapped.

Future operations that cannot be reconstructed/mapped must be added explicitly. The API intentionally prefers `orphaned` over heuristic relocation.

Quote-based automatic fuzzy reattachment is **not** performed by the core mapper. It can be built as a separate recovery tool where human review is acceptable.
