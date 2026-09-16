# Explicit document migrations

`@arichtext/core/migrations` provides synchronous, opt-in forward migration.
`parseDocument()`, editor setters, profiles and persistence adapters remain
strict: none run migrations automatically. Load saved JSON, migrate explicitly,
and only use or save the result after success.

## Current ART target

```ts
import { createARTMigrationRegistry } from '@arichtext/core/migrations';

const migrations = createARTMigrationRegistry();
const result = migrations.migrate(savedJSON);
if (result.ok) {
  editor.setJSON(result.document);
} else {
  // Keep the original saved data. Offer recovery in the host application.
  console.error(result.error.code, result.error.message);
}
```

This registry targets `ART_DOCUMENT_VERSION` and validates with `isARTDocument()`.
It starts empty. ART currently defines only v1: valid current documents return
an independent parsed copy with no steps; newer versions are rejected. There is
no bundled v0 format, historical migration, downgrade or malformed-table repair.

## Registering host-owned steps

A step has `fromVersion`, `toVersion` and `migrate(source: string): string`.
Both strings are JSON; using immutable serialized input prevents the callback
from mutating caller-owned objects. The callback must validate the historical
payload it understands, transform it and return the declared target version.
Callbacks must be trusted, deterministic and synchronous. They are not sandboxed.

For example, **only if your application owns this legacy version-0 envelope**:

```ts
import { createTextDocument } from '@arichtext/core';

const unregister = migrations.register({
  fromVersion: 0,
  toVersion: 1,
  migrate(source) {
    const old = JSON.parse(source);
    if (typeof old.text !== 'string') throw new TypeError('Invalid legacy text');
    return JSON.stringify(createTextDocument(old.text));
  },
});
```

That example does not designate version 0 as a historical ART standard. Foreign
editor shapes belong in [format converters](format-profiles.md), not in ART
version labels. Keep a backup of saved data and verify your own feature mappings
before replacing persisted content.

For other versioned document contracts or future-version fixtures, construct
`new DocumentMigrationRegistry<T>({ version, validate })`. Supply a pure,
synchronous type-guard validator for that target. A non-ART target result is not
accepted by the current ART editor merely because migration succeeded.

## Path and result contract

- Versions are nonnegative safe integers. Each step strictly increases its
  version and may not exceed the configured target. Direct jumps are permitted.
- Only one outgoing step per source version is allowed. Duplicate registrations,
  downgrades and invalid targets throw `TypeError` at configuration time.
- `list()` returns sorted, read-only step metadata without callbacks. Registration
  copies metadata; its disposer is idempotent and cannot remove a replacement.
- Before any callback runs, the registry resolves the entire path to the target.
  Missing paths fail immediately. The selected path is snapshotted so registry
  changes during a callback affect only subsequent migration calls.
- Every input/output must have a JSON object envelope with `type: "doc"` and a
  valid `version`. Each intermediate result must match the step's declared
  `toVersion`. Intermediate payload semantics are the callback's responsibility.
- The final target validator must return `true`. It receives a separate parsed
  copy, so retained validator references cannot mutate the returned document.
- Success returns `{ ok: true, document, steps }`. Failure returns
  `{ ok: false, error: { code, message }, steps }`, with no partial document.
  `steps` records completed transformations, not a commit to storage; it can be
  nonempty even when final validation fails. Retry starts from the original input.

| Error code | Meaning |
| --- | --- |
| `invalid-json` | Input is not a string containing valid JSON |
| `invalid-envelope` | Parsed input lacks a valid document type/version |
| `future-version` | Input version exceeds the configured target |
| `missing-migration` | No complete registered path to the target |
| `migration-failed` | A callback threw; its exception contents are not exposed |
| `invalid-output` | Callback returned a non-string, malformed envelope or wrong version |
| `invalid-document` | Final target validation failed or threw |

The registry performs no persistence, editor update, rollback of callback side
effects, asynchronous work or loss-review UI. Use side-effect-free callbacks.
There is no automatic acceptance of lossy historical transformations; hosts own
their mapping and review policy. Extension-local payload migrations remain the
extension's responsibility, especially when the ART root version is unchanged.
