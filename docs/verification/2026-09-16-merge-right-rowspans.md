# Merge right in vertical grids — local verification

Merge with right cell now works across matching rowspans and beside unrelated
vertical spans. The cells must touch in the logical grid and share their complete
top/bottom edge. A carried rowspan between physical neighbors prevents merging.
Content concatenation, review-anchor mappings, selection and Undo are preserved.

- `pnpm verify`: 389 unit tests across 65 files; package policy, builds,
  typechecks, Vue examples and bundle budgets passed.
- 40 targeted table browser cases across five profiles passed with default
  timeouts, one worker and no retries/skips. Coverage includes merge/split,
  Undo/Redo, HTML round-tripping, locks and carried-span rejection.
- All 26 tarballs passed isolated consumer checks.
- All 21 component-only captures regenerated without browser script errors;
  existing screenshots were unchanged. The vertical-table example can demonstrate
  merging Build into Deliver alongside Design's rowspan.
- `git diff --check` passed.

The full browser suite was not repeated. The [last full run](2026-09-16-presets.md)
remains evidence for its recorded revision. Row/column editing in vertical grids,
physical-device, real-IME, screen-reader and public-release gates remain open.
GitHub Actions remained disabled. Local logs: `/tmp/art-merge-right-spans-*`.
