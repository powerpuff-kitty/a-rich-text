# Markdown compatibility target

The default `art:markdown-v1` profile remains the **ART Markdown subset**. Its
CommonMark reference version is **0.31.2**. Naming that reference does not claim
full CommonMark, GFM, MDX or Pandoc conformance.

## Verified scope: code spans

All 22 upstream examples in the CommonMark 0.31.2 “Code spans” section are
vendored unchanged with attribution under their original CC BY-SA 4.0 license.
The tests assert 20 supported examples and explicitly assert the two known
mismatches; none are silently skipped. See
[fixtures and licensing](../packages/markdown/test/fixtures/README.md) and
[the test runner](../packages/markdown/test/commonmark.test.ts).

The runner compares ART's HTML serialization to upstream expected HTML, allowing
soft line breaks to render as spaces and equivalent quote escaping in HTML text.
It does not trim or collapse code-span content. This is scoped compatibility
coverage, not a run of the entire CommonMark fixture suite.

Implemented behavior includes equal-length backtick delimiters, literal shorter
or longer internal runs, line-ending normalization within code spans, significant
space preservation, and code precedence over apparent emphasis/link markup.
The serializer adds delimiter padding when needed so literal backticks and
leading/trailing spaces round-trip. Backtick fence openers with backticks in their
info string are not interpreted as fenced code blocks.

## Verified scope: ATX headings

All 18 upstream ATX heading examples (62–79) are vendored unchanged and match
after normalizing block-separating HTML newlines, the equivalent `<hr>` spelling,
the paragraph soft break in example 70, and the code-block final line terminator
in example 69 (the same ART convention as fenced-code import).

The parser recognizes empty headings and H1–H6, requires ASCII space/tab or
end-of-line after opening hashes, and permits up to three leading spaces.
Closing hashes require preceding space/tab; literal and escaped hashes are
preserved. Export escapes literal hashes to prevent their interpretation as
heading markers. Round-trip and source/visual editor regressions cover this.
See [heading tests](../packages/markdown/test/headings.test.ts).

## Verified scope: indented code blocks

All 12 upstream indented-code examples (107–118) are vendored unchanged. Eleven
match; example 109 remains an explicit mismatch for tight-list paragraph
rendering. The runner normalizes block-separating HTML
newlines, paragraph soft breaks and the final code line terminator. ART stores
code text without that terminal separator, consistently with fenced-code import;
internal blank lines, extra indentation, tabs and trailing spaces are preserved.

Four columns of ASCII spaces/tabs start code at a block boundary. Tabs advance
to four-column stops. Indented code cannot interrupt a paragraph. Leading and
trailing blank lines are excluded; blank lines between code chunks remain.
Export uses fenced code and preserves the canonical code text on reimport.
See [indented-code tests](../packages/markdown/test/indented-code.test.ts).

## Verified scope: setext headings

All 27 upstream setext heading examples (80–106) are vendored unchanged.
Twenty-four match; examples 93, 94 and 99 retain explicit mismatches for lazy
blockquote continuation and tight-list paragraph rendering. The runner normalizes
block separators, soft breaks outside code, equivalent text quote escaping and
ART's omitted final code line terminator.

An underline of `=` or `-`, with up to three leading spaces and optional trailing
spaces/tabs, converts the preceding paragraph to H1 or H2. Multiline headings,
inline marks, escaped markers and thematic-break precedence are covered. Export
uses canonical ATX (`#`/`##`) syntax, preserving the document rather than the input
heading spelling. Source edits update the visual editor automatically.
See [setext tests](../packages/markdown/test/setext-headings.test.ts).

## Verified scope: fenced code blocks

All 29 upstream fenced-code examples (119–147) are vendored unchanged and match
under the documented ART final-code-line and HTML soft-break normalization.
Opening indentation is removed up to its width, including partial tab columns;
extra code indentation and internal/trailing blank lines remain. Closing fences
must use the same marker, be at least as long, have at most three leading ASCII
spaces and only spaces/tabs after them. Unclosed fences consume the remaining
container content without inventing an extra line at end of input.

Only the first space/tab-delimited info-string word becomes the ART code language.
Additional info metadata (for example `startline=3`) is not retained: ART has no
field for it. This replaces the previous behavior of treating the entire info
string as the language. Entity/escape decoding in info strings is not yet covered.
Export normally uses backticks, or tildes when the language contains a backtick;
the fence is longer than any matching marker run in the content.
See [fenced-code tests](../packages/markdown/test/fenced-code.test.ts).

### Known exclusions

| Upstream example | Remaining behavior |
| --- | --- |
| 109 | Tight-list HTML rendering retains ART paragraph wrappers |
| 93 | Lazy blockquote continuation is not implemented |
| 94, 99 | Tight-list HTML rendering retains ART paragraph wrappers |
| 344 | Raw HTML tag precedence over backticks is not implemented; HTML remains literal text |
| 346 | CommonMark autolink precedence and URL encoding are not implemented |

Other unverified/incomplete areas include the complete emphasis delimiter
algorithm, reference links, raw HTML, autolinks,
list/container edge cases and full GFM extensions. Existing tasks, pipe tables,
strike and underline are ART subset features, not evidence of full GFM conformance.

Markdown export still has the [documented fidelity limits](conversion.md): it
cannot preserve arbitrary ART metadata or table spans. An inline code span's
line endings normalize to spaces; use a code block when line structure matters.

## Upstream reference

[CommonMark 0.31.2](https://spec.commonmark.org/0.31.2/#code-spans) supplies the
reference rules and examples. The machine-readable source is
[spec.json](https://spec.commonmark.org/0.31.2/spec.json). Extending compatibility
requires additional upstream fixtures and an explicit feature mapping to ART;
issue #2 stays open for broader interoperability.
