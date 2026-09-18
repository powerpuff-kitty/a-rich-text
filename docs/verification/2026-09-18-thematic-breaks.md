# Markdown thematic breaks: local verification

Runtime/test revision: `5a993540ed168ea4d28102b648a846deaf579588`.

- New regressions reproduced tab-separated rule failures, non-ASCII/control whitespace being consumed as rule delimiters, and rules incorrectly absorbed into lists before implementation.
- `pnpm verify`: 800 unit tests across 82 files, package policy, builds, TypeScript/Vue checks and bundle ceilings passed.
- `node scripts/build-distribution.mjs`: browser distribution and showcase rebuilt.
- `pnpm exec playwright test tests/browser/markdown-compatibility.spec.ts tests/browser/live-source.spec.ts tests/browser/profiles.spec.ts --workers=2 --retries=0`: all 95 targeted cases passed, 19 per browser profile; no failures, retries or skips. Runtime/build/test files remained fixed throughout this run.
- `pnpm verify:distribution`: 27 tarballs inspected; SSR exports and isolated TypeScript consumer passed.
- Minimal/standard gzip: 39,007/57,875 bytes, within ceilings. No dependency or schema changes.

All 19 upstream CommonMark 0.31.2 thematic-break examples are tracked unchanged:
15 match under the documented normalization; four existing emphasis/tight-list
rendering mismatches remain explicit. Structural tests separately verify list
boundaries and rules inside list items. Browser regressions exercise automatic
Markdown source updates, DOM list/rule placement, canonical export and reimport.
See [compatibility scope](../markdown-compatibility.md).

This is targeted browser evidence. The [last full baseline](2026-09-16-surfaces.md)
remains 470 cases. No full CommonMark/GFM conformance, physical-device/IME or
screen-reader verification is claimed. No GitHub Actions or public release.
Existing documentation screenshots were not regenerated.

[Machine-readable evidence](2026-09-18-thematic-breaks.json).
