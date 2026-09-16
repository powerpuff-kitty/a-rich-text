# @arichtext/core

Browser-first structured rich-text core for A Rich Text.

ES modules with TypeScript declarations. MIT licensed. No mandatory hosted service.

This package is part of [A Rich Text](https://github.com/powerpuff-kitty/a-rich-text).
See the repository's [integration guide](https://github.com/powerpuff-kitty/a-rich-text/blob/main/docs/getting-started.md) for local installation and the standard editor.
Exported API declarations are included in `dist/`. Version 0.0.0 is a development snapshot; it is not a stable public release.

The optional `@arichtext/core/profiles` entry exports `FormatProfileRegistry`,
`artJSONProfile` and conversion result/diagnostic types. Registries are instance-scoped
and never apply conversions to an editor. See [format profiles](https://github.com/powerpuff-kitty/a-rich-text/blob/main/docs/format-profiles.md).

## JSON Schema

The package includes `@arichtext/core/schema/art-v1.schema.json` (Draft 2020-12).
Load it into your JSON Schema validator for ART v1 structural checks. Always
follow with `isARTDocument()` or `parseDocument()` for table-grid coverage and
runtime nesting limits. The schema permits extra properties like the current
runtime validator; it does not sanitize URLs or validate extension-specific data.
The `$id` is an identifier, not a promised hosted download endpoint. No JSON Schema
validator is added to the editor bundle.

## Explicit migrations

`@arichtext/core/migrations` exports `createARTMigrationRegistry()` for explicit
migration to current ART, plus `DocumentMigrationRegistry<T>` for a supplied
version/validator target. Register trusted synchronous JSON-string transformations
with increasing `fromVersion`/`toVersion`, then call `migrate(savedJSON)`.
Results contain either a validated document or a structured error, with completed
step metadata. Paths are checked before callbacks run. No migrations ship by
default; parsing, editor setters and storage never migrate automatically.
