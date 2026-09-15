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
