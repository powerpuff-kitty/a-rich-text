# Optional Quill Delta profile

`@arichtext/quill-delta` is a DOM-free adapter for a defined subset of Quill
**document snapshots**. It exports `quillDeltaProfile`, `importQuillDelta(source)`
and `exportQuillDelta(document)`. It depends only on ART core and is not loaded by
the base or standard editor. No Quill runtime is installed.

The profile ID is `quill:delta-v2` (this adapter's Quill 2 mapping), with family
`json`. Delta itself has no root version field. This is not complete Quill
interoperability or a claim that every custom blot/format is supported.

## Register explicitly

```ts
import { quillDeltaProfile } from '@arichtext/quill-delta';

editor.registerFormatProfile(quillDeltaProfile);
editor.views = ['visual', 'html', 'json'];
editor.profiles = ['art:html-v1', 'art:json-v1', 'quill:delta-v2'];
editor.sourceProfile = 'quill:delta-v2';
// To also submit Delta through native forms:
editor.format = 'json';
editor.profile = 'quill:delta-v2';
```

Source selection and form output stay independent. Loss diagnostics pause source
auto-import until confirmed in the toolbar; lossy output blocks forms unless the
host explicitly permits it with `profile-loss="allow"`. See
[the shared profile contract](format-profiles.md). Detection never auto-registers
or selects this converter.

[Try the live example](http://127.0.0.1:8080/quill-delta.html) after building the
browser distribution. It loads a separate `quill-delta.js` module and submits ART
JSON so you can review what the imported Delta becomes.

## Supported mapping

| Delta representation | ART representation |
| --- | --- |
| Text and unformatted line breaks | Paragraphs |
| `bold`, `italic`, `underline`, `strike`, `code`, `link` | Corresponding inline marks |
| `color`, `background`, `script: sub/super` | Constrained color/background marks and sub/sup marks |
| `font`, `size` | `quill:font` and `quill:size` extension marks with explicit format diagnostics |
| `image` embed | ART image block |
| `video` embed | `quill:video` extension block with source preserved |
| `formula` embed | `quill:formula` extension mark with formula value preserved |
| Newline `header: 1` through `6` | Heading levels |
| Newline `list: bullet/ordered/checked/unchecked` | Flat lists and task items |
| Newline `blockquote: true` | Quotes containing paragraphs |
| Newline `code-block: true` or a language string | Code blocks, optionally with language |

Consecutive matching list/quote/code lines are grouped. Equal adjacent text runs
and Delta operations are coalesced; mark order, optional empty content and op
segmentation are normalized. Semantic text-block round trips are tested, not
byte-identical or arbitrary ART-tree round trips.

## Losses and rejection

Import requires an object with `ops`, nonempty string inserts and a final newline.
It rejects `retain`/`delete`, bad attribute types and conflicting supported line
formats. Unsupported custom embeds receive explicit diagnostics; supported image,
video and formula embeds are preserved using native or extension ART nodes.
Exceptions become failed imports through the profile registry; the editor retains
its canonical document.

Unknown attributes, indentation/style, misplaced line formats, unmapped object
fields and inline marks within code blocks produce `loss` diagnostics. Readable
text is retained. Unsupported indentation is flattened, so nested-list hierarchy
is not preserved.

On export, tables, rules, nested/multi-block lists and complex quotes fall back to
ART plain-text extraction with a loss diagnostic. Supported image, video and
formula extension nodes are emitted as Quill embeds; other extension blocks/marks,
repeated marks, custom numbering, non-task checked state and unknown fields are
reported when omitted. Inline newlines become block boundaries;
adjacent matching groups can merge; an empty ART document becomes one empty line.
Those changes also report loss. Inspect diagnostics before accepting the result.

The direct functions return `{ value, diagnostics }` previews and throw on invalid
input. They do not mutate an editor, apply losses, sanitize URL protocols or make
network requests. Use the registry/component for typed errors and review behavior.
A host rendering links or images remains responsible for its URL policy.

## Reference and scope

Quill's [Delta documentation](https://quilljs.com/docs/delta) defines document vs
change operations, newline line formatting and the terminal newline. Its
[format catalogue](https://quilljs.com/docs/formats) lists a broader set than this
adapter handles. Task values and code-language behavior were checked against
Quill's [list implementation](https://github.com/slab/quill/blob/main/packages/quill/src/formats/list.ts)
and [syntax module](https://github.com/slab/quill/blob/main/packages/quill/src/modules/syntax.ts).
Fixtures here are independently authored mapping tests, not a full upstream
conformance suite. Version 0.0.0 is still a locally packaged development snapshot.
