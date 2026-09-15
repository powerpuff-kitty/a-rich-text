# Native form integration

`<a-rich-text>` is designed to behave like a rich equivalent of a native form control.

The editor can expose its form value in different storage formats while retaining ART JSON as the canonical structured model.

Planned/implemented format values:

- `html` — rich HTML for conventional server forms
- `json` — serialized ART JSON
- `markdown` — portable Markdown
- `text` — plain text

Example:

```html
<form method="post">
  <a-rich-text name="body" format="markdown"></a-rich-text>
  <button>Save</button>
</form>
```

Changing the output format must not require a server call and must not change the semantic document stored inside the editor.
