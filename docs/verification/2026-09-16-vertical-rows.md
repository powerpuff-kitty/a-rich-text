# Rows in vertically merged tables — local verification

Row insertion uses the active cell's complete vertical extent, extends other
spans crossing the insertion boundary and creates empty cells in uncovered
columns. Removal deletes the starting row, shrinks crossing spans and moves
surviving originating spans into the next row. Unit-height cells in that row are
deleted. Review mappings and Undo are preserved; caret placement can resolve to
an earlier cell spanning a fully covered row.

- `pnpm verify`: package policy, builds, typechecks, Vue examples, bundle budgets
  and the then-current 395 unit cases passed.
- After adding combined-span coverage, `pnpm test`: 396 tests across 65 files
  passed. A final covered-row caret regression passed with all 39 table tests;
  397 distinct unit cases are covered by these runs together.
- 45 targeted table browser cases across five profiles passed with default
  timeouts, one worker and no retries/skips.
- All 26 tarballs passed isolated consumer checks.
- All 21 component-only screenshots regenerated without browser script errors;
  the updated vertical-table row controls were inspected.
- `git diff --check` passed.

The full browser suite was not repeated. The [previous full run](2026-09-16-presets.md)
remains evidence for its recorded revision. Column editing in vertical grids,
physical-device, real-IME, screen-reader and public-release gates remain open.
GitHub Actions stayed disabled. Local logs: `/tmp/art-vertical-rows-*`.
