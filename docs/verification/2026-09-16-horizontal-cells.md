# Horizontal cell authoring — local verification

Scope: merge with the right cell, split a column span, preserve content/review
anchors and Undo, contextual developer-controlled tools, and Tab navigation
through horizontal spans. Vertical spans and row/column editing of merged grids
remain unsupported. Splitting retains content on the left rather than guessing
its original distribution. HTML/JSON retain spans; Markdown/plain text do not.

- `pnpm verify`: 358 unit tests across 63 files, package policy, builds,
  typechecks, strict Vue example checks and bundle budgets passed.
- `node scripts/build-distribution.mjs`: standalone and component examples built.
- `pnpm exec playwright test tests/browser/merged-cells.spec.ts tests/browser/remove-table.spec.ts --workers=1`:
  20 cases across five browser profiles passed, default timeouts, no retries/skips
  (35.5 seconds).
- `pnpm exec playwright test tests/browser/editor.spec.ts --grep 'table Tab' --workers=1`:
  five existing keyboard-navigation/exit cases passed, default timeouts,
  no retries/skips (20.1 seconds).
- `pnpm verify:distribution`: all 26 tarballs passed isolated consumer checks.
- `node scripts/capture-docs.mjs`: 17 component-only captures completed without
  browser script errors; the merged-cell image was visually inspected.
- Gallery/example links and `git diff --check` passed.

An initial unit assertion omitted the unchanged second row in its expected
nested table. The expectation was corrected before the passing full unit run.
The full browser suite was not repeated. Physical devices, real IME,
screen readers and other production gates remain open.

GitHub Actions stayed disabled. Logs: `/tmp/art-merge-cells-*`.
