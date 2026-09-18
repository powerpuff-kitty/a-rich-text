# Markdown compatibility target

The default `art:markdown-v1` profile remains the **ART Markdown subset**. Its
CommonMark reference version is **0.31.2**. Naming that reference does not claim
full CommonMark, GFM, MDX or Pandoc conformance.

## Verified scope: paragraphs, blank lines and textual content

All 12 upstream examples from these three sections (219–227 and 650–652) are
vendored unchanged and match after normalizing block separators, paragraph soft
breaks, `<br>` spelling and ART's omitted final code line terminator. Each also
round-trips through Markdown export.

Only ASCII spaces and tabs make a blank line or contribute paragraph indentation
and trailing whitespace. Non-breaking spaces, other Unicode spaces, BOM characters,
form feeds and vertical tabs remain paragraph text, including at document edges
and on otherwise empty lines. Unicode line/paragraph separators remain text;
inside quotes they no longer cause the quote scanner to stall. Quote indentation
uses up to three ASCII spaces. Export removes trailing ASCII layout whitespace
without trimming Unicode text. Existing soft/hard-break normalization still applies.
These checks do not establish arbitrary whitespace fidelity in other Markdown
constructs. See [paragraph tests](../packages/markdown/test/paragraphs.test.ts).

## Verified scope: thematic breaks

All 19 upstream thematic-break examples (43–61) are vendored unchanged.
Sixteen match after normalizing block separators, soft breaks outside code,
equivalent `<hr>` spelling and ART's omitted final code line terminator.
Examples 57, 60 and 61 retain
tight-list paragraph wrappers. Separate structural assertions verify the
list/rule boundaries rather than treating these HTML mismatches as skips.

Rules accept three or more identical `*`, `-` or `_` markers separated and
followed only by ASCII spaces/tabs, with at most three leading spaces. Unicode
whitespace and other characters do not count as rule separators. Four-column
indentation still belongs to code; a setext underline still takes precedence
after paragraph text. A rule at the list's indentation ends that list rather
than becoming another item. Explicit and indented rules inside list items remain
inside them. Export uses `***` for a rule at the start of a bullet item, avoiding
the ambiguous `- ---` spelling. General list/container indentation conformance
remains outside this increment.
See [thematic-break tests](../packages/markdown/test/thematic-breaks.test.ts).

## Verified scope: code spans

All 22 upstream examples in the CommonMark 0.31.2 “Code spans” section are
vendored unchanged with attribution under their original CC BY-SA 4.0 license.
The tests assert 21 supported examples and explicitly assert the remaining raw-HTML
mismatch; none are silently skipped. See
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
string as the language. Backslash escapes of ASCII punctuation in language words are decoded; entity
decoding in info strings is not yet covered.
Export normally uses backticks, or tildes when the language contains a backtick;
the fence is longer than any matching marker run in the content.
See [fenced-code tests](../packages/markdown/test/fenced-code.test.ts).

## Verified scope: backslash escapes and line breaks

All 13 upstream backslash-escape examples (12–24), 15 hard-break examples
(633–647) and two soft-break examples (648–649) are vendored unchanged.
Ten escape, thirteen hard-break and both soft-break examples match after
normalizing equivalent HTML quotes, `<br>` spelling, soft breaks and ART's final
code line convention. The five remaining interactions are explicit mismatches
in [the tests](../packages/markdown/test/escapes-breaks.test.ts).

Backslashes escape ASCII punctuation, not ordinary letters, digits or Unicode
characters. A trailing unescaped backslash or two or more spaces produce a hard
break only between paragraph lines. Escaped backslashes stay literal; code spans
and code blocks retain their existing literal behavior. Soft breaks fold to spaces.
Export writes internal non-code text newlines as two spaces plus a newline so
paragraph hard breaks survive reimport, including inside supported inline marks.
Terminal block breaks, arbitrary whitespace and multiline ATX heading fidelity
are not established by these fixtures.

## Verified scope: angle-bracket autolinks

All 19 upstream autolink examples (594–612) are vendored unchanged. Fifteen
match exactly after removing the final HTML line ending. Four use schemes
outside ART's existing URL allowlist (`irc`, `a+b+c`, `made-up-scheme` and
`localhost`); these deliberately remain literal text, including their brackets.
The same policy keeps executable and other unsupported URLs non-interactive.

Absolute URI and email syntax inside `<...>` creates link marks for accepted
targets. Bare URLs/email addresses do not become links during Markdown import;
the editor's typed-space URL detection is a separate feature. Code spans and
autolinks take precedence in encounter order: markup inside either is literal.
URI backslashes and entity-like text are not decoded as Markdown escapes or
HTML entities. Destinations percent-encode unsafe URI characters while retaining
existing percent escapes; labels retain the original text. Malformed UTF-16 URI
input stays literal rather than throwing.

Export uses angle syntax when it exactly preserves a link's label and href,
including surrounding formatting. Links with different labels keep explicit
link syntax. An autolink inside a potential link label is not wrapped in another
link; the surrounding bracket syntax stays literal. General link/reference
parsing remains incomplete. The formerly excluded code-span example 346 and
backslash example 20 now match. See [autolink tests](../packages/markdown/test/autolinks.test.ts).

## Verified scope: emphasis delimiter runs

All 132 upstream emphasis/strong-emphasis examples (350–481) are vendored
unchanged. 129 match canonical ART semantics; three raw-HTML interactions
(475–477) remain explicit mismatches. The test oracle imports the upstream HTML
into ART, so duplicate nested emphasis collapses to one mark, nesting order
becomes canonical mark order, and soft breaks fold to spaces. This is semantic
coverage, not a claim of byte-identical HTML output.

Delimiter runs use Unicode whitespace/punctuation flanking, intraword underscore
restrictions and the rule of three. Matched pairs cannot cross, escaped markers
remain literal, and code/autolink atoms retain their original boundary punctuation.
Explicit link labels resolve their own emphasis. List marker whitespace is ASCII
space/tab, preventing non-breaking spaces from turning an emphasis example into
a list. Examples 14 and 55 from earlier fixture sections now match as well.
Export keeps shared outer marks open across adjacent text nodes, avoiding
ambiguous delimiter runs around nested italics and code. Round-trip regressions
cover mixed bold/italic, code and links; they do not
establish arbitrary ART whitespace/mark-boundary fidelity. See
[emphasis tests](../packages/markdown/test/emphasis.test.ts).

## Verified GFM extension scope: pipe tables

All eight upstream table examples (198–205) from the published GFM 0.29 spec
are vendored unchanged. They match retained ART semantics after importing the
expected HTML: ART has no header-cell or column-alignment field, and HTML table
section wrappers are not retained. The ordinary paragraph soft break in example
203 folds to a space. This is not byte-identical HTML or full GFM conformance.

Header and delimiter rows must have the same cell count. Delimiter cells accept
one or more hyphens with optional alignment colons. Body rows can omit pipes;
short rows gain empty cells and excess cells are ignored, as specified by GFM.
Blank lines and recognized ART block starts end a table. A delimiter-looking
body row remains ordinary cell text. ASCII cell padding is trimmed; Unicode
spaces remain text. Directly escaped pipes stay in their cells, including inside
code spans and after other backslashes. Round-trip tests cover those contents.

Automatic padding is limited to 65,536 cells per table to bound expansion from
wide headers and short rows. A row that would exceed the limit ends the table;
remaining input is parsed normally. Header roles, alignment and cell spans are
not representable by this Markdown/ART mapping. Broader container and block
precedence interactions remain unverified. See
[table tests](../packages/markdown/test/tables.test.ts) and the
[GFM table rules](https://github.github.com/gfm/#tables-extension-).

### Known exclusions

| Upstream example | Remaining behavior |
| --- | --- |
| 57, 60, 61 | Tight-list HTML rendering retains ART paragraph wrappers |
| 21, 475–477, 642, 643 | Raw HTML is literal text rather than interpreted HTML |
| 22, 23 | Link titles/reference definitions are not supported |
| 109 | Tight-list HTML rendering retains ART paragraph wrappers |
| 93 | Lazy blockquote continuation is not implemented |
| 94, 99 | Tight-list HTML rendering retains ART paragraph wrappers |
| 344 | Raw HTML tag precedence over backticks is not implemented; HTML remains literal text |
| 596, 598, 599, 601 | URI schemes outside ART's URL allowlist remain literal text |

Other unverified/incomplete areas include reference links, raw HTML, GFM bare-URL autolinking,
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
