# Columns in horizontally merged tables — local verification

Column insertion/removal now uses logical positions. Insertion beside the whole
active cell creates empty cells or widens spans crossing the boundary. Removal
targets the active cell's leftmost logical column, deleting unit cells and
shrinking wider cells while retaining their content. Undo restores the exact
previous table; surviving review anchors retain mappings. Vertical spans remain
unsupported.

- `pnpm verify`: 366 unit tests across 63 files, package policy, builds,
  typechecks, strict Vue example checks and bundle budgets passed.
- Distribution and component examples rebuilt.
- `pnpm exec playwright test tests/browser/merged-table-columns.spec.ts tests/browser/merged-table-rows.spec.ts tests/browser/merged-cells.spec.ts --workers=1`:
  20 targeted cases across five profiles passed with default timeouts,
  no retries/skips (36.6 seconds).
- `pnpm verify:distribution`: all 26 tarballs passed isolated consumer checks.
- Capture script regenerated all 17 component-only screenshots without browser
  script errors; the changed merged-table image was inspected.
- `git diff --check` passed.

The full browser suite was not repeated for this change. The earlier
[full-run baseline](2026-09-16-full-local.md) remains evidence for its recorded
revision, not a full run of this newer implementation. Manual/device/IME,
accessibility, performance and release gates remain open. GitHub Actions stayed
disabled. Local logs: `/tmp/art-merged-columns-*`.
