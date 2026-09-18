# ADR 0003: Version ART documents independently and migrate explicitly

- Status: Accepted
- Date: 2026-09-18
- Records implemented decisions from #49, #86 and #87; no new format is introduced.

## Context

ART JSON is the canonical document representation. Package releases, HTML and
Markdown mappings, and extension payloads evolve at different rates. Loading
stored content must not silently reinterpret or rewrite it.

## Decision

Keep a numeric root document version separate from package versions. The current
supported format is ART v1. Public parsing, editor setters and persistence validate
the current format strictly. The packaged JSON Schema describes the structural
contract; runtime validation also enforces semantic constraints such as table-grid
validity. No v0 format or historical migration is implied.

Migration is explicit and opt-in through `@arichtext/core/migrations`. Resolve a
complete forward path before running trusted synchronous steps, validate each
output envelope and the final target document, and return a structured failure
without a partial document. The host keeps the original input and decides when to
save a successful result. There is no automatic downgrade or malformed-data repair.

Incompatible persisted root semantics require an explicit version/migration
assessment. Development validation corrections must still describe their impact;
[ADR 0002](0002-table-grid-validation.md) records the existing unpublished v1 table
validation decision. Extension authors own namespaced payload compatibility and
extension-local migrations. Foreign-editor conversion belongs in format profiles,
not fabricated ART version numbers.

## Alternatives and consequences

Coupling document versions to every package release creates unnecessary migrations.
Silently migrating on load hides loss and can overwrite recoverable originals.
The explicit approach gives hosts a review and recovery boundary, at the cost of
requiring them to provide any historical transformations they actually support.
There are no bundled historical steps today.

## Evidence and related contracts

- [Core migration implementation](../../packages/core/src/migrations.ts)
- [Runtime and JSON Schema contract](../json-schema.md)
- [Migration API and failure behavior](../migrations.md)
- [Public API stability](../api-stability.md)
