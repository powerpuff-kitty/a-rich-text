# Editor formats and profiles

Reviewed against official documentation on 2026-09-16. This is a representative
interoperability catalogue, not a market-share ranking or a list of bundled adapters.
A **format** is a syntax family; a **profile** is the document structure and feature
rules an editor expects. There is no finite count of JSON schemas or Markdown dialects.

## Major editor ecosystems

| Editor | Document/profile | Exchange formats and compatibility limits | Official reference |
| --- | --- | --- | --- |
| A Rich Text | ART JSON v1 | Built-in HTML fragments, ART Markdown subset and plain text. JSON is validated against ART's runtime schema. | [Conversion contract](conversion.md) |
| Quill | Delta JSON (`ops`, inserts, attributes; changes may also retain/delete) | A document Delta and a change Delta are different inputs. Embeds and custom formats require mappings. | [Delta](https://quilljs.com/docs/delta) |
| Tiptap / ProseMirror | Schema-dependent document JSON (`type`, `content`, marks, attributes) | HTML export; Tiptap Markdown extension supports GFM. Installed nodes/extensions determine fidelity. | [JSON/HTML](https://tiptap.dev/docs/guides/output-json-html), [Markdown](https://tiptap.dev/docs/editor/markdown/getting-started/basic-usage) |
| Editor.js | OutputData JSON (`time`, `blocks`, `version`; each block has tool-specific `data`) | The tool set defines block semantics; HTML/Markdown conversion needs tool-aware serializers. | [Saving data](https://editorjs.io/saving-data/) |
| Lexical | Serialized EditorState JSON with a root and serialized nodes | HTML and Markdown helpers depend on registered nodes/transformers. Custom nodes need their own mappings. | [Serialization](https://lexical.dev/docs/serialization/), [Markdown](https://lexical.dev/docs/serialization/markdown-mdast) |
| Slate | Application-defined JSON node tree | Applications write serializers for HTML, Markdown and text; there is no universal Slate document schema. | [Serialization](https://docs.slatejs.org/concepts/10-serializing) |
| TinyMCE | HTML output | HTML5 content; configured features and filtering govern which markup survives. Not a generic rich-text JSON interchange schema. | [Documentation](https://www.tiny.cloud/docs/tinymce/latest/) |
| CKEditor 5 | HTML by default; internal editing model is separate | Optional Markdown processor uses GFM. A Markdown processor does not preserve every HTML/editor feature. | [Data API](https://ckeditor.com/docs/ckeditor5/latest/api/module_core_editor_utils_dataapimixin-DataApi.html), [Markdown](https://ckeditor.com/docs/ckeditor5/latest/features/markdown.html) |
| Notion | Public block API JSON with typed blocks and rich-text objects | User exports include HTML or Markdown/CSV. API blocks and export files are different representations; not every UI block is supported by the API. | [Blocks](https://developers.notion.com/reference/block), [Exports](https://www.notion.com/help/export-your-content) |
| Google Docs | Public document API JSON with structured elements | API resources are not a portable editor-native JSON standard or a claim about Google's internal storage. Document-level layout and resources need explicit mapping. | [Document structure](https://developers.google.com/workspace/docs/api/concepts/structure) |

Foreign JSON profiles above are **reference-only**: this project does not ship their
converters. HTML from other editors can enter through the supported HTML subset,
but that does not guarantee preservation of custom embeds, comments, styles or layout.

## Common format families

- **JSON:** standardized syntax, arbitrary application schemas. ART, Delta,
  ProseMirror, Editor.js, Lexical and Slate are not interchangeable just because
  `JSON.parse()` succeeds. JSON Schema can describe a profile; it is not itself a
  shared rich-text document format.
- **HTML:** web markup, often exchanged as a fragment. Editor-specific classes,
  attributes, embeds and sanitization policies act as practical profiles. We do
  not offer an XHTML/XML parser or arbitrary CSS/layout preservation.
- **Markdown:** CommonMark, GFM, Pandoc Markdown and MDX are examples, not an
  exhaustive list. MDX includes JSX/JavaScript and needs a different trust and
  execution model. Our Markdown converter is a documented subset, not a complete
  implementation of any of these dialects.
- **Plain text:** no rich document structure. Encoding and line endings are file
  concerns; the JavaScript API accepts strings.

See the [format contract and standards](conversion.md) and the
[format-profile registry](format-profiles.md). The `profile`, `source-profile`
and `profiles` attributes select registered converters. Existing `views` and
`format` still control source families and submitted values. External-editor
converters are not bundled.

## Detection

`detectInputFormat(source)` from `@arichtext/web-component` (also re-exported by
`@arichtext/editor`) returns `format`, `profile`, `confidence`, `supported` and
`alternatives`. It never modifies the editor:

```js
import { detectInputFormat } from '@arichtext/editor';
const hint = detectInputFormat(source);
// Ask the host/user to choose when ambiguous; then use the explicit setter.
if (hint.profile === 'art-v1' && hint.confidence === 'validated') {
  editor.setJSON(source);
}
```

Only ART JSON gets `validated` confidence. Foreign JSON shape hints include
`quill-delta`, `editorjs-blocks`, `prosemirror`, `lexical` and `slate`; they are not
schema validation. Other JSON is `unknown-json`. Incomplete JSON-looking input
is unsupported and ambiguous, so an application should not silently import it as
plain text. HTML and Markdown are heuristic; ordinary text remains ambiguous.
The detector cannot reliably identify the producing application or Markdown
dialect. Explicit user/developer selection wins. Clipboard behavior is unchanged.

## Live source editing and tidy formatting

See [source editing configuration](editor-configuration.md#automatic-source-updates-and-formatting)
for the implemented automatic-update attribute, contextual toolbar actions and
optional formatter API.
Prettier formats source layout; it does not repair a foreign document schema,
validate ART semantics, sanitize HTML, execute embedded code, or provide ESLint's
JavaScript lint rules. The editor's converters and validation remain separate.
[Prettier browser documentation](https://prettier.io/docs/browser).
