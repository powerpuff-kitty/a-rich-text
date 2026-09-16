# Vertical cell splitting — local verification

Split cell now expands horizontal, vertical and combined spans into unit cells.
Content and selection stay in the top-left cell; the other new cells are empty.
Other spans and existing cell contents are retained. Review-anchor mappings follow
shifted physical cell indices, and Undo restores the exact original table.
Vertical merging and row/column editing in vertical grids remain unsupported.

- `pnpm verify`: 383 unit tests across 65 files; package policy, builds,
  typechecks, Vue example checks and bundle budgets passed.
- Distribution and component examples rebuilt.
- Targeted table browser tests: 30 cases across five profiles passed in 38.5s
  with default timeouts, one worker, and no retries/skips. Coverage includes
  splitting combined spans with covered rows, navigation, Undo, locks and tools.
- `pnpm verify:distribution`: all 26 tarballs passed isolated consumer checks.
- All 21 component-only screenshots captured without browser script errors;
  the updated vertical-span example was inspected.
- A final oversized-grid assertion passed in the 25-test table unit file.
- `git diff --check` passed.

The full browser suite was not repeated for this bounded table-command change.
[The previous full run](2026-09-16-presets.md) remains evidence for its recorded
revision. Physical-device, real-IME, screen-reader and release gates remain open.
GitHub Actions stayed disabled. Local logs: `/tmp/art-vertical-split-*`.
