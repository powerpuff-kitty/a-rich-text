# Optional Quill Delta profile: local verification

- `pnpm exec vitest run packages/quill-delta/test/delta.test.ts`: 35 converter tests passed.
- `pnpm verify`: 561 tests across 74 files, builds, TypeScript/Vue checks, package policy and bundle ceilings passed.
- `node scripts/build-distribution.mjs`: standard distribution and separate optional adapter/example built.
- `pnpm verify:distribution`: 27 offline tarballs passed inspection, all-export SSR imports and isolated TypeScript consumer checks, including the Delta API.
- `pnpm exec playwright test tests/browser/quill-delta.spec.ts tests/browser/profiles.spec.ts --workers=4 --retries=0`: 35 targeted cases across five browser profiles passed, without failures, retries or skips. Covers automatic text import, native ART submission, loss confirmation, rejection without canonical mutation and existing profile regressions.
- Browser report SHA-256: `d6a9b5f05de016b58f462e43d7a7f8056ae63456f572374f489e77118a01b3fc`.
- Base/standard gzip sizes unchanged: 38,215 / 57,077 bytes. No Quill runtime dependency.

All verification ran locally; GitHub Actions remains disabled. This is a targeted browser run, not a new full-suite baseline. [PR #85](2026-09-16-format-profiles.md) remains the last full browser run. Existing component screenshots were not regenerated because component styling did not change.

Fixtures implement the documented subset and are not an upstream Quill conformance suite. Imported embeds/change Deltas are rejected; unsupported ART structures export as explicitly lossy plain-text fallbacks. No public npm release is claimed.
