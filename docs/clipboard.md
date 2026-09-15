# Clipboard and paste

A Rich Text handles textual paste entirely in the browser. Raw clipboard HTML is not inserted into the live editing surface before sanitization.

## Pipeline

```text
ClipboardEvent
   ↓
@arichtext/clipboard
   ↓
HTML normalization / plain-text parsing
   ↓
@arichtext/html allowlist importer
   ↓
validated ART fragment
   ↓
@arichtext/engine transaction
   ↓
canonical ART document
```

The Web Component calls `preventDefault()` on supported paste events before the browser inserts clipboard HTML.

## Rich HTML

When `text/html` is available it is preferred over `text/plain`.

The clipboard package normalizes only a deliberately small presentation subset commonly emitted by office editors:

- `font-weight: bold` / numeric weight ≥ 600 → bold
- `font-style: italic|oblique` → italic
- `text-decoration: underline` → underline
- `text-decoration: line-through` → strikethrough

Classes and inline style attributes are then removed. The resulting markup still passes through the regular allowlisted HTML importer, which drops executable/embed nodes and unsafe URL protocols.

Arbitrary color, font, positioning, event handlers or application-specific CSS do not become ART formatting.

## Plain text

If no HTML payload is available, `text/plain` is treated literally.

```text
# not Markdown
**still literal**
```

becomes two ART paragraphs. Markdown syntax is not interpreted during ordinary plain-text paste.

Empty lines are preserved as empty paragraphs.

## ART fragment insertion

Paste is represented as one engine transaction.

For a selection contained in one paragraph/heading:

- one inline block merges into the current block
- a multi-block fragment splits the current block around the paste point
- the first inline pasted block continues the left side
- the final inline pasted block continues into the original right-side text
- non-inline blocks can be inserted between preserved left/right text blocks
- the resulting caret is deterministic

The operation is undoable as one history entry.

## Current boundary

Cross-block selections are not yet assigned paste merge semantics. In that case `<a-rich-text>` prevents raw insertion, leaves the ART document unchanged, and emits an `error` event with context `paste-unsupported-selection`.

Clipboard payloads with no HTML or plain text (for example image-only paste) are also rejected explicitly for now. Media paste will use the separate upload/media pipeline rather than silently embedding browser-generated data URLs.
