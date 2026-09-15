# Structural editing semantics

A Rich Text keeps common Enter/Backspace/Delete behavior inside the ART transaction engine whenever the current block structure can be represented deterministically.

## Enter / paragraph splitting

`insertParagraph(state)` operates on a selection contained in one paragraph or heading.

- a paragraph splits into two paragraphs
- a heading keeps the left side as the same heading level and creates a paragraph on the right
- a selected range in one block is deleted before the split
- nested paragraphs can split inside their current container, such as a list item or table cell
- cross-block selections currently fall back rather than guessing structural merge semantics

The resulting caret is placed at offset `0` in the new right-hand paragraph.

## Backspace and Delete

For a collapsed caret inside a text block:

- Backspace deletes the previous grapheme
- Delete deletes the next grapheme
- Backspace at offset `0` joins an adjacent previous paragraph/heading sibling
- Delete at the end joins an adjacent next paragraph/heading sibling

A join is deliberately limited to blocks that share the same ART parent. It never crosses from a blockquote/list/table container into a different parent implicitly.

The left block type wins during a join. For example, deleting at the end of a heading followed by a paragraph produces one heading containing both inline contents.

## Grapheme safety

Deletion uses `Intl.Segmenter` with `granularity: 'grapheme'` when available, so emoji sequences and combining characters are removed as one visible unit.

When `Intl.Segmenter` is unavailable the fallback deletes Unicode code points rather than UTF-16 code units. The fallback therefore never removes only half of a surrogate pair, although complex multi-code-point graphemes may require more than one deletion.

## Browser input mapping

The DOM adapter marks these `beforeinput` types as engine-capable:

- `insertParagraph`
- `deleteContentBackward`
- `deleteContentForward`

The Web Component asks the current engine state for a matching command. It calls `preventDefault()` only when a command can actually be produced.

Word/line deletion (`deleteWordBackward`, `deleteHardLineForward`, etc.) remains browser fallback until explicit word/line boundary semantics are implemented.

## Undo/redo

Split, join and grapheme deletion are ordinary ART transactions, so they participate in the same bounded undo/redo history as text insertion and formatting.
