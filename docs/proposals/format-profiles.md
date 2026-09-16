# Proposed format profiles

Status: original design proposal. The registry and component configuration are
now implemented as described in [the current contract](../format-profiles.md).
The illustrative API below is historical; use the namespaced IDs and attributes
in the current contract. External-editor adapters remain future work. Follow-up to
[the conversion contract](../conversion.md) and [issue #77](https://github.com/powerpuff-kitty/a-rich-text/issues/77), with schema work in issue #2. This separates
recommendations from the editor's current `format`, `view` and `views` API.

## Terms and examples

There is no fixed total of rich-text JSON schemas, Markdown dialects or HTML
application profiles. Applications can define more. Useful examples include:

| Family | What varies | Examples, not a complete inventory |
| --- | --- | --- |
| JSON | Document schema and extension/node set | ART v1; [Quill Delta](https://quilljs.com/docs/delta); [Editor.js tool blocks](https://editorjs.io/saving-data/); [Slate's application-defined nodes](https://docs.slatejs.org/concepts/10-serializing) |
| HTML | Syntax, supported vocabulary, packaging and styles | The HTML standard distinguishes [HTML and XML serialization](https://html.spec.whatwg.org/multipage/introduction.html#html-vs-xhtml); a semantic fragment and a complete HTML page also differ in packaging. Email-oriented or application-allowlisted markup is a usage profile, not a separate universal HTML standard. |
| Markdown | Parsing rules and extensions | [CommonMark](https://spec.commonmark.org/), [GFM](https://github.github.com/gfm/), [Pandoc Markdown](https://pandoc.org/MANUAL.html#pandocs-markdown). [MDX](https://mdxjs.com/docs/what-is-mdx/) additionally supports JSX/JavaScript and needs a separate integration rather than treating it as ordinary Markdown. |

A family name alone does not specify compatible content. Even two editors using
the same JSON ecosystem may enable different nodes or plugins.

## Recommended behavior

1. Keep ART as the internal model. Profiles convert at import/export boundaries;
   changing a menu selection does not replace the engine or reimport the document.
2. Preserve current defaults: ART v1 JSON, supported semantic HTML fragments,
   the current ART Markdown subset and plain text. Do not relabel that Markdown
   subset CommonMark/GFM without conformance evidence.
3. Developers select the default output profile, the initial source profile and
   the profiles users may choose. Keep source inspection independent of the native
   form output format, as it is today.
4. Offer built-ins plus optional developer-registered profiles. A profile must
   have an installed converter before it can appear in the dropdown. Attributes
   select registered IDs; they do not load scripts or execute converter strings.
5. Group menu entries by family only when there are multiple configured profiles:
   for example JSON → ART v1 / Article JSON; Markdown → Current subset / GFM.
   Keep the existing flat menu for the default configuration.
6. Each profile declares its family, stable ID/version, label and supported import/
   export directions. Export-only profiles permit inspection/download but cannot
   apply edited source. Import-only profiles belong in an import action.
7. Conversion reports unsupported features and losses before an import is applied.
   Validate the resulting ART document, then replace it atomically. Errors keep the
   draft and canonical document unchanged. Reuse the existing Apply/Discard and
   native-form validity contract; a pending draft cannot silently change profiles.
8. Register optional converters after explicitly importing their modules. Do not
   add every external editor/parser to the base bundle. Treat HTML as untrusted
   input, and do not execute imported MDX or arbitrary markup.

## Illustrative API shape

This original illustration is historical; it is **not a copyable current example**:

```html
<a-rich-text
  format="json"
  profile="art-v1"
  views="visual html markdown json"
  profiles="semantic-html art-markdown art-v1 acme:article-v1">
</a-rich-text>
```

A proposed `registerFormatProfile()` registration would supply the ID, family,
label and `import`/`export` functions. Its import result must validate as ART;
its export result must be a serialized string, with structured loss diagnostics.
The profile's JSON schema/version belongs in its own contract. JSON Schema alone
cannot perform the conversion.

Omitting new profile options must retain existing behavior. Explicit unknown or
family-mismatched IDs should produce configuration errors, not silently fall back
to a different storage format. Registration must reject duplicate IDs; disposal
must not discard a dirty draft. Exact method/attribute names, diagnostic types,
registry scope and dynamic-removal behavior need API review before implementation.

## Verification before shipping

Round-trip and lossy-conversion fixtures per adapter; malformed input and foreign
schema rejection; source-draft preservation; native form output; profile/default
changes; custom profile registration/removal; and keyboard/viewport tests for the
grouped menu. Standards claims require the named dialect's upstream conformance
fixtures. Profiles and adapters should state supported extensions explicitly.
