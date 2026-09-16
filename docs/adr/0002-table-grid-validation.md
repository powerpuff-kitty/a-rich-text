# ADR 0002: Validate occupied table grids

- Status: Accepted
- Date: 2026-09-16

## Context

The development snapshot compared summed colspans independently in each row.
That rejects valid vertical spans and accepts layouts whose rows overlap earlier
rowspans. Navigation needs validated physical cells with logical positions.

## Decision

Validate the occupied grid across rows. Require positive safe-integer spans,
consistent width, no gaps or overlaps, and no span extending beyond the last row.
Retain empty physical rows fully covered by earlier rowspans. Use intervals over
physical cells rather than allocating one entry per logical column.

Keep ART version 1 because the wire fields and their meaning are unchanged in
this unpublished 0.0.0 development snapshot. This is a stricter validation
contract: previously accepted malformed documents can now fail. Document the
compatibility impact; do not silently repair or discard cells.

## Alternatives

Keeping per-row sums preserves the validation bug. A dense grid is simpler but
allocates memory proportional to numeric spans from imported documents.

## Consequences

Valid positive vertical spans round-trip through HTML/JSON and support physical
cell navigation. Structural vertical authoring remains separate work. Consumers
with malformed saved tables must repair them before loading; no migration is
performed. This decision does not supersede the ART-first engine decision.
