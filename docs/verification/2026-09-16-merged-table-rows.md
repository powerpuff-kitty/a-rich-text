# Rows in horizontally merged tables — local verification

Row insertion/removal now supports horizontal spans. Inserted rows contain one
empty unit cell per logical column. Surviving spans/content and annotation paths
are retained; row removal clamps the caret to a surviving physical cell.
Vertical spans and column operations on merged grids remain unsupported.

- `pnpm verify`: 361 unit tests across 63 files, package/build/type/example checks
  and bundle budgets passed.
- Distribution and all runnable component examples rebuilt.
- `pnpm exec playwright test tests/browser/merged-table-rows.spec.ts tests/browser/merged-cells.spec.ts --workers=1`:
  15 targeted cases across five profiles passed with default timeouts,
  no retries/skips (22.3 seconds).
- `pnpm verify:distribution`: all 26 tarballs passed isolated consumer checks.
- Screenshot script regenerated 17 component captures without script errors;
  the updated merged-cell screenshot was visually inspected.
- `git diff --check` passed.

The full browser suite was not repeated. Physical-device, real-IME,
screen-reader and broader production checks remain open. GitHub Actions stayed
disabled. Logs: `/tmp/art-merged-rows-*`.
