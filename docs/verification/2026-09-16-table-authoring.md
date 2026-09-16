# Full local verification: merged-table authoring

The complete local verification sequence passed on source revision
`ca648161a861c3d2a8aec331762d97de657c933f`. This includes all table merge/split,
row/column and navigation changes since the previous full run. The subsequent
evidence commit changes documentation, compatibility metadata and the screenshot.

Commands: `pnpm verify`, `node scripts/build-distribution.mjs`,
`pnpm test:browser`, and `pnpm verify:distribution`. All ran locally.

| Gate | Result |
| --- | --- |
| Package policy, builds, TypeScript and Vue examples | Passed |
| Unit tests | 404 passed across 65 files |
| Full browser matrix | 305 passed, 61 per profile, zero failures/retries/skips |
| Timing | Default 30s tests / 5s assertions; 4 default workers; 306.1 seconds |
| Distribution | All 26 tarballs imported without a DOM; isolated TypeScript consumer passed |
| Minimal bundle | 31,594 gzip bytes / 51,200 ceiling |
| Standard bundle | 47,562 gzip bytes / 66,560 ceiling |
| Gallery | 21 component-only captures without browser script errors |

Profiles: Chromium 153.0.8010.12, Firefox 155.0, WebKit 26.6, Pixel 7 Chromium
emulation and iPhone 15 WebKit emulation. The vertical-table screenshot was
inspected with both row and column controls visible. Local documentation links
and `git diff --check` passed.

New coverage includes insertion beside carried rowspans, widening crossing
combined spans only once, filling uncovered rows, shrinking/removing spanning
cells, mapping surviving review anchors, Undo/Redo, and caret recovery when the
active row loses its last physical cell. The full suite also covers presets,
source views, native forms, customization, dialogs and other editor features.

[Machine-readable summary](2026-09-16-table-authoring.json) includes per-profile
counts and the raw report SHA-256. Local logs: `/tmp/art-vertical-columns-*`;
raw browser report: `test-results/playwright-results.json` (ignored, replaceable).

## Remaining scope

The planned row/column, matching-edge merge and split operations now support
valid grids up to 50 rows and 50 logical columns, including horizontal, vertical
and combined spans. Broader structural selection editing remains separate work.
Markdown/plain text still flatten spans; use HTML or ART JSON to retain them.

Physical-device, real-IME, screen-reader, broad RTL/reduced-motion, performance
and public-release prerequisites remain open. Browser emulation is not physical
device evidence. GitHub Actions remained disabled.
