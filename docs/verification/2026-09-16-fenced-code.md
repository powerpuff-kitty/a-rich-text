# Fenced code: local verification

Runtime/test revision: `833156ec78623c61ad5328559f459a35378410dc`.

- New tests exposed 11 failures before implementation; all 160 Markdown tests now pass, including all 29 unchanged upstream fenced-code examples.
- `pnpm verify`: 720 unit tests across 80 files, package policy, builds, TypeScript/Vue checks and bundle ceilings passed.
- `node scripts/build-distribution.mjs`: browser distribution and showcase rebuilt.
- `pnpm exec playwright test tests/browser/markdown-compatibility.spec.ts tests/browser/live-source.spec.ts tests/browser/code-editor.spec.ts --workers=2 --retries=0`: 75 targeted cases across five profiles passed, no failures/retries/skips. Runtime and build files remained fixed throughout the run.
- `pnpm verify:distribution`: 27 tarballs inspected; SSR exports and isolated TypeScript consumer passed.
- Minimal/standard gzip: 38,876/57,768 bytes, within ceilings. No dependencies changed.

This is targeted browser evidence; the [last full baseline](2026-09-16-surfaces.md) remains 470 cases. No GitHub CI or public release. Physical-device, IME, screen-reader and release gates remain open.

The [compatibility contract](../markdown-compatibility.md) documents normalization of ART's omitted final code line separator, HTML block separators and soft breaks outside code. Extra fence info metadata is not retained; only the first word is stored as language. Info-string entity/escape decoding and broader container interactions remain outside this increment. Full CommonMark/GFM conformance is not claimed.
