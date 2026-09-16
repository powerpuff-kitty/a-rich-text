# Merge with cell below — local verification

The contextual `merge-cell-below` control and `mergeCellBelow()` standard
controller method use `mergeTableCellBelow(state)`. Cells must share the same
logical left/right boundaries and be immediately adjacent vertically. The
command combines rowspans and appends the lower cell's blocks, preserving moved
and shifted review anchors, selection and Undo. Mismatched widths, table edges,
oversized grids and cross-block selections expose no action.

- `pnpm verify`: 386 unit tests across 65 files; package policy, build,
  typechecks, Vue examples and bundle budgets passed.
- 65 targeted browser cases passed across five profiles with default timeouts,
  one worker and no retries/skips. Coverage includes configuration/source views,
  table commands, locks, merge/split, Undo/Redo and HTML round-tripping.
- All 26 tarballs passed isolated consumer checks.
- All 21 component-only screenshots regenerated without browser script errors;
  the updated vertical-span toolbar was inspected.
- `git diff --check` passed.

The full browser suite was not repeated. The [previous full run](2026-09-16-presets.md)
remains evidence for its recorded revision. Merging right and row/column editing
in vertical grids remain follow-up work. Physical-device, real-IME,
screen-reader and release gates remain open. GitHub Actions stayed disabled.
Local logs: `/tmp/art-merge-below-*`.
