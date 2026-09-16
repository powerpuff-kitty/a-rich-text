# Conversion contracts

A Rich Text uses **ART JSON** as its canonical structured document model. HTML, Markdown and plain text are portable representations of that model, not competing internal states.

## Packages

| Package | Import | Export | Runtime |
| --- | --- | --- | --- |
| `@arichtext/core` | ART JSON | ART JSON / plain text | JavaScript |
| `@arichtext/html` | HTML → ART | ART → HTML | Browser import; export is DOM-independent |
| `@arichtext/markdown` | Markdown → ART | ART → Markdown | JavaScript |
| `@arichtext/web-component` | all of the above | all of the above | Browser |

## Security boundary

HTML is always treated as untrusted input unless an integrating application explicitly establishes a separate trust boundary.

`@arichtext/html` parses incoming HTML into the allowlisted ART schema and serializes ART back to HTML. This means unsupported executable/embed nodes are discarded instead of copied through.

Default link protocols:

- `http:`
- `https:`
- `mailto:`
- `tel:`
- relative/hash/query URLs

Default image protocols:

- `http:`
- `https:`
- `blob:`
- relative URLs

Data images are opt-in for HTML conversion and limited to common image MIME types.

## Fidelity policy

Conversion is deterministic for the supported ART model, but external formats are not equally expressive.

- ART JSON is the lossless canonical representation.
- HTML covers the initial ART v1 block/mark model closely.
- Markdown uses standard syntax where possible; underline is represented with inline `<u>` markup.
- Markdown tables flatten cell spans because pipe-table syntax cannot represent `rowspan`/`colspan` faithfully.
- Unsupported HTML nodes are unwrapped or dropped rather than stored as opaque executable markup.

High-fidelity office document conversion belongs to optional A Rich Text Cloud services, not the browser core.

## Web Component API

```ts
editor.getJSON();
editor.setJSON(document);
editor.serializeJSON();

editor.getHTML();
editor.setHTML(html);

editor.getMarkdown();
editor.setMarkdown(markdown);

editor.getText();
```

All conversions above run on the user's device.

The component also exposes developer-configured HTML, Markdown, JSON and text
source views. See [tools and document views](editor-configuration.md). Merely
switching views never reparses or changes the canonical document; applying an
edited source explicitly imports it under the fidelity policy above.

## Table grid validation

ART tables must cover a rectangular grid exactly once. Positive safe-integer
`colspan` and `rowspan` values are supported; omitted spans mean 1. A rowspan must
end within the table. A physical row may contain no cells when earlier rowspans
cover its entire width. HTML conversion retains these empty rows so valid
vertical spans round-trip through HTML and JSON. HTML `rowspan="0"` (extend to the
end of a row group) is not supported; use an explicit positive span.

Core `getTableLayout(table)` returns logical column positions for physical cells,
or `null` for gaps, overlaps or inconsistent widths. It does not expand large
spans into a dense matrix. Editing/navigation retain their 50-row/column limits.

This corrects the development snapshot's former per-row width check. Some
malformed tables accepted previously are now rejected by ART validation and
editor setters. Repair those documents before loading them; there is no automatic
repair or schema version bump. See [ADR 0002](adr/0002-table-grid-validation.md).
