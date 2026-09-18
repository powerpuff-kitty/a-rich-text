# ADR 0005: Give inline extensions one atomic position

- Status: Accepted
- Date: 2026-09-18
- Implements the inline extension deliverable in #6.

## Decision

Add a namespaced `extensionInline` variant to paragraph/heading content with JSON
attributes and a required nonempty `fallbackText`. It occupies one UTF-16 logical
position, represented by U+FFFC in logical text, and cannot carry marks or editable
children. DOM rendering is noneditable. Installed runtime hooks are optional;
ART and portable HTML preserve data without them. Plain-text and Markdown export
use the label and lose identity; the Quill profile explicitly diagnoses the loss.

This is an additive variant in the unpublished 0.0.0 / ART v1 development contract.
Existing documents need no migration. Older strict v1 validators reject documents
containing the new variant; this is not backwards-reader compatibility. Consumers
must upgrade together before writing atoms, or explicitly accept a lossy export.
No persisted documents are automatically rewritten. A released-schema change would
require a separate version/migration assessment under ADR 0003.

## Consequences

Caret offsets do not depend on label length or custom renderer markup. Text-only
operations cannot edit a fraction of a mention. Search and annotation quotes use
logical U+FFFC rather than the visible label. Text-only AI proposals reject these
blocks. Applications needing editable annotated text should use extension marks
instead. Runtime removal never changes document data.
