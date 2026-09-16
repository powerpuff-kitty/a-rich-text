# Format profiles

A format family (`json`, `html`, `markdown`, `text`) identifies syntax. A profile
identifies a particular document representation and its converter. ART remains
the internal model; converters run only at import/export boundaries.

## Developer configuration

```html
<art-editor id="article" name="article"
  format="json" profile="acme:article-v1"
  views="visual html json"
  profiles="art:html-v1 art:json-v1 acme:article-v1"
  source-profile="acme:article-v1"
  source-update="auto"></art-editor>
```

Register `acme:article-v1` through JavaScript before using it. An unknown profile
shows a configuration error and blocks native form submission. Attributes never
load code. Registration after declarative markup is supported, including its
initial `value`.

| Setting | Meaning |
| --- | --- |
| `format` | Existing native-form output family |
| `profile` / `.profile` | Output/value import profile, matching `format` |
| `views` | Existing source-family allowlist, plus the visual editor |
| `profiles` / `.profiles` | Optional source-profile allowlist; only registered export-capable IDs are accepted |
| `source-profile` / `.sourceProfile` | Initial/current source profile; its family must be enabled in `views` |
| `profile-loss="reject\|allow"` | Whether developer-configured `value`/form conversions may report losses; default `reject` |

Omitting profile settings preserves existing serializers and menus. Built-in IDs
are `art:json-v1`, `art:html-v1`, `art:markdown-v1`, and `art:text-v1`. The JSON
profile is ART v1, HTML is the supported fragment vocabulary, and Markdown is the
existing ART subset—not a CommonMark/GFM conformance claim. Existing built-in
converters retain their documented fidelity limits; they do not provide exhaustive
loss diagnostics. Custom converters are responsible for accurate diagnostics.

Source choice is independent of form output. Switching source profiles exports
the current document without reimporting it. Pending drafts must be applied or
discarded first. Export-only profiles allow inspection but make source read-only;
import-only profiles are available through `importProfile()`, not the source menu.

## Custom converter

```js
const editor = document.querySelector('#article');
const unregister = editor.registerFormatProfile({
  id: 'acme:article-v1',
  family: 'json',
  label: 'Article JSON',
  import(source) {
    const input = JSON.parse(source);
    if (typeof input.body !== 'string') throw new TypeError('Expected body text');
    return {
      value: {
        type: 'doc', version: 1,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: input.body }] }],
      },
    };
  },
  export(document) {
    // This example intentionally accepts only one unformatted paragraph.
    const block = document.content[0];
    if (document.content.length !== 1 || block.type !== 'paragraph' ||
        block.content?.some(text => text.marks?.length)) {
      throw new TypeError('Article JSON supports one unformatted paragraph');
    }
    return { value: JSON.stringify({ body: (block.content ?? []).map(t => t.text).join('') }) };
  },
});
```

IDs must be namespaced; include the representation version in the ID when its
contract changes. Registration is per editor. Duplicate IDs fail. Remove all
attribute references before calling the returned disposer; disposal never
silently switches an active source or output profile. A stale disposer cannot
remove a later registration of the same ID.

Converters must be deterministic, synchronous, trusted application code. The registry does not
sandbox them or load external parsers. Imported results are validated as ART and
copied; export receives an isolated copy. JSON-family source and output must
parse as strict JSON. Import/export exceptions become structured errors, with no
canonical document mutation. Do not insert arbitrary converter HTML into the DOM;
use ART rendering or the existing sanitized HTML boundary.

## Review diagnostics before applying

Each converter returns `{ value, diagnostics? }`. Diagnostics contain `code`,
`message` and `severity` (`warning`, `loss`, or `error`). Errors produce a failed
result without a value. Losses return a preview that requires a decision:

```js
const result = editor.importProfile('acme:article-v1', serialized);
if (result.ok && !result.diagnostics.some(note => note.severity === 'loss')) {
  editor.setJSON(result.value);
}
```

`importProfile()` and `exportProfile()` only preview conversion. They never change
the editor. Their result is `{ ok: true, value, diagnostics }` or
`{ ok: false, diagnostics }`. `formatProfiles` lists immutable metadata and import/
export capabilities. `sourceDiagnostics` exposes current source diagnostics.

In source mode, a reported loss pauses automatic import and exposes Apply in the
toolbar. The first manual Apply similarly shows diagnostics; a subsequent Apply
accepts the reported losses. Custom toolbars can call `applySource(true)` after
presenting them. `applySource()` without that argument does not accept losses.
Invalid and pending drafts block native form submission. `profile-loss="allow"`
is a developer opt-in for output/value conversions, not automatic source approval.

`profile-error` events carry `{ message }` in `detail` for invalid configuration.
The component also displays the error and marks native form validity accordingly.

## Core-only use

```js
import { FormatProfileRegistry, artJSONProfile } from '@arichtext/core/profiles';
const registry = new FormatProfileRegistry();
registry.register(artJSONProfile);
const result = registry.import('art:json-v1', serialized, 'json');
```

Registries start empty. `list()` returns metadata; `import()` and `export()` take
an optional expected family and reject mismatches. No DOM or framework is needed.

## Compatibility limits

The optional [Quill Delta adapter](quill-delta.md) can be registered explicitly.
Editor.js, ProseMirror, Lexical and Slate adapters are not supplied. Format detection remains a suggestion and never selects a converter.
See [the editor format catalogue](editor-formats.md). The [ART JSON Schema](json-schema.md) ships separately from the converter registry;
[document migration](migrations.md) is a separate opt-in API. Applying source still resets visual
Undo history. The package remains a development snapshot at version 0.0.0.

Try [the runnable custom-profile example](http://127.0.0.1:8080/format-profiles.html)
after building the browser distribution, or read [its source](../examples/format-profiles/index.html).
