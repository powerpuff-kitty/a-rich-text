# Conversion contracts

A Rich Text uses **ART JSON** as its canonical structured document model. HTML, Markdown and plain text are portable representations of that model, not competing internal states.

## Standards and interoperability

The syntax of a format and the document structure stored in it are separate
contracts. A parser accepting a file does not guarantee that all its formatting
or metadata can be retained.

| Format | External specification | This repository's contract |
| --- | --- | --- |
| HTML | [WHATWG HTML Living Standard](https://html.spec.whatwg.org/multipage/introduction.html) | Supported semantic HTML fragments mapped to ART; not arbitrary HTML/CSS or full-page round trips |
| Markdown | [CommonMark](https://spec.commonmark.org/) and the [GFM dialect](https://github.github.com/gfm/) specify parsing rules | A custom supported subset, including pipe tables, tasks and strike; no claim of full CommonMark/GFM conformance |
| ART JSON | [JSON syntax, RFC 8259](https://www.rfc-editor.org/rfc/rfc8259) | Standard JSON syntax containing the project's versioned ART document structure |
| Plain text | Text without rich-document semantics | Text extraction/import; styles, links as marks and table structure are lost; choose UTF-8 when writing files or sending bytes |

HTML is suitable for publishing supported content. Markdown is useful for text
workflows that accept its reduced fidelity. Save ART JSON to retain the supported
document model for re-editing. Merely inspecting a source view is lossless; applying
edited HTML/Markdown/text reconstructs the document from that representation.

### Is there a standard rich-text JSON format?

JSON standardizes objects, arrays, strings, numbers, booleans and null. It does
not assign meaning to keys such as `content`, `blocks` or `ops`. There is no single
universal rich-text JSON interchange schema shared by these editors:

- [Quill Delta](https://quilljs.com/docs/delta) represents content and changes using operations.
- [Editor.js output](https://editorjs.io/saving-data/) uses its own block/tool data structure.
- ART JSON uses the `ARTDocument` contract implemented by this repository.

For example, this is an ART v1 document:

```json
{
  "type": "doc",
  "version": 1,
  "content": [
    { "type": "paragraph", "content": [{ "type": "text", "text": "Hello" }] }
  ]
}
```

`setJSON()` validates ART, not any arbitrary JSON document. The format/view API
value remains `json`; the menu labels it **ART JSON** to make this explicit.
Quill Delta and Editor.js JSON are not accepted directly. Dedicated adapters would
need to map supported nodes/marks and report losses; none are bundled currently.
HTML can be an exchange bridge when both applications support the relevant content,
but it cannot promise preservation of editor-specific features.

ART JSON stores document content. It does not bundle the editor's undo stack,
selection, appearance or separately managed comments/collaboration state.
`version: 1` identifies the ART format version; unknown versions are rejected.
The migration API remains open in [issue #2](https://github.com/powerpuff-kitty/a-rich-text/issues/2).

For developer defaults and custom converter selection, see the
[format-profile proposal](proposals/format-profiles.md). That registry is not
implemented; the existing format/view attributes retain their current behavior.

### What about JSON Schema?

[JSON Schema](https://json-schema.org/understanding-json-schema/about) is a
specification for describing and validating JSON structures. It can describe ART,
Delta or another application's structure; it does not make those structures
interchangeable and does not define a rich-text format itself.

Today ART has TypeScript types and runtime validation in
[core](../packages/core/src/index.ts). A distributable JSON Schema document is not
yet included. Publishing one, with parity checks against the runtime validator,
is follow-up work under #2. Semantic checks such as rectangular table coverage
still need code even with a JSON Schema artifact.

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
edited source (manually or with opt-in automatic updates) imports it under the fidelity policy above.

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
