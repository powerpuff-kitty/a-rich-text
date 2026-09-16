# Native form integration

`<a-rich-text>` is designed to behave like a rich equivalent of a native form control.

The editor can expose its form value in different storage formats while retaining ART JSON as the canonical structured model.

Supported format values:

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

## Validation and lifecycle

`required` rejects a document with no non-whitespace text; `checkValidity()`,
`reportValidity()`, `validity`, `validationMessage`, `willValidate`, `form` and
`name` expose the native form contract. Images alone do not satisfy text-required
validation. Readonly and disabled controls do not fail required validation.

A disabled fieldset makes the editor noneditable without adding a permanent
`disabled` attribute; re-enabling it restores editing. The `disabled` getter
includes this inherited form state so optional controllers honor it.

Form reset restores the `value` attribute (or an empty document). Browser form
state restoration uses canonical JSON, independently of the output `format`.
Normal `input` events expose document changes; `change` is emitted on blur.

Pending source-view drafts block native form validation until applied or
discarded. `format` controls submitted serialization independently of `view`.
See [source editing and recovery](editor-configuration.md#source-editing-and-recovery).
