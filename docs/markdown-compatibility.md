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

### Known exclusions

| Upstream example | Remaining behavior |
| --- | --- |
| 344 | Raw HTML tag precedence over backticks is not implemented; HTML remains literal text |
| 346 | CommonMark autolink precedence and URL encoding are not implemented |

Other unverified/incomplete areas include the complete emphasis delimiter
algorithm, reference links, setext headings, indented code, raw HTML, autolinks,
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
