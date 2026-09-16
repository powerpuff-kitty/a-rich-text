# ART v1 JSON Schema

The core package ships [art-v1.schema.json](../packages/core/schema/art-v1.schema.json)
as `@arichtext/core/schema/art-v1.schema.json`. It uses the
[JSON Schema Draft 2020-12 dialect](https://json-schema.org/draft/2020-12/json-schema-core).
It describes ART's structure, not a universal rich-text JSON format.

## Use the packaged artifact

For Node environments supporting JSON import attributes:

```js
import schema from '@arichtext/core/schema/art-v1.schema.json' with { type: 'json' };
import { isARTDocument } from '@arichtext/core';
// Ajv is an optional dependency installed by the integrating application.
import Ajv2020 from 'ajv/dist/2020.js';

const validateStructure = new Ajv2020().compile(schema);
const value = JSON.parse(serialized);
if (!validateStructure(value) || !isARTDocument(value)) {
  throw new TypeError('Invalid ART document');
}
```

Bundlers and other languages can load the JSON file directly with their own
Draft 2020-12 validator. Ajv is only a development dependency here, used for
parity tests; it is not shipped in the editor runtime. Its
[2020-12 entry point](https://ajv.js.org/json-schema.html#draft-2020-12-breaking)
is needed for this dialect.

The schema `$id` is `https://arichtext.com/schemas/art-v1.schema.json`. It identifies
this schema; no hosted endpoint is promised. Load the local package artifact;
all references are internal and validation needs no network access. The project
is still version 0.0.0; a package export does not imply a public npm release.

## Coverage and compatibility

The schema checks document type/version; block, inline and mark placement;
heading levels; list styles and required task checkboxes; nonempty link/image
strings; positive image dimensions; positive safe-integer table spans; and
namespaced extensions with JSON-object attributes. All current block/mark kinds
are included. Covered physical table rows may have empty `content` arrays.

Extra object properties are intentionally permitted to match current runtime
validation. This is validation, not normalization or removal of unknown fields.
Empty documents and optional paragraph content remain valid. Changing this to
reject extra properties would be a separate compatibility decision.

## Runtime checks remain required

A schema pass alone is insufficient to load a document into the editor:

- `getTableLayout()` checks rectangular coverage, gaps, overlaps, total safe
  column widths and rowspans extending beyond the table.
- Runtime validation caps nested blocks and extension-attribute nesting.
- JSON Schema validates JSON data. JavaScript-specific values such as getters,
  symbols, sparse arrays, prototypes and non-finite numbers are outside that
  interchange model; extension attributes have additional runtime checks.
- Link/image strings are not URL-policy validation. HTML conversion applies its
  own protocol rules. Extension-specific payload meanings belong to extensions.

[Parity fixtures](../packages/core/test/schema.test.ts) compare schema/runtime
results for valid and invalid JSON structures and explicitly test semantic cases
where schema acceptance must still be rejected by the runtime.

The separate [migration API](migrations.md) runs explicitly registered version
steps; schema validation itself never migrates data. Quill Delta, Editor.js,
Lexical and other editor shapes require [format converters](format-profiles.md).
Remaining dialect conformance and foreign-adapter work stays tracked in issue #2.
