# Whole-table removal — local verification

Adds contextual whole-table removal, an editable paragraph replacement, atomic
Undo, developer tool configuration and a standard-controller command. Imported
merged tables can be removed without changing their grid first. Row/column
operations on merged cells remain outside this change.

- `pnpm verify`: 355 unit tests across 63 files, package policy, builds,
  typechecks, Vue example checks and bundle budgets passed.
- The table command test file was also run directly after adding the deleted
  review-anchor assertion: 12 tests passed.
- `node scripts/build-distribution.mjs`: standalone and component examples built.
- `pnpm exec playwright test tests/browser/remove-table.spec.ts --workers=1`:
  10 cases across Chromium, Firefox, WebKit and two mobile emulation profiles
  passed with default timeouts, no retries/skips (28.1 seconds).
- `pnpm verify:distribution`: all 26 package tarballs passed consumer checks.
- `node scripts/capture-docs.mjs`: 16 component-only screenshots regenerated
  without browser script errors; the changed table screenshot was inspected.
- `git diff --check`: passed.

An initial build caught a missing function-closing brace; it was corrected before
all passing checks above. The full browser suite was not repeated. Physical-device,
real IME, screen-reader and broader production gates remain open.

GitHub Actions remained disabled. Logs are under `/tmp/art-remove-table-*`.
