# Markdown escapes and line breaks: local verification

Runtime/test revision: `8bf5a1c1dcac84882d9b63b8a8b6e509b64b0519`.

- New tests exposed nine failures before implementation. All 199 Markdown tests now pass.
- `pnpm verify`: 759 unit tests across 81 files, package policy, builds, TypeScript/Vue checks and bundle ceilings passed.
- `node scripts/build-distribution.mjs`: browser distribution and showcase rebuilt.
- `pnpm exec playwright test tests/browser/markdown-compatibility.spec.ts tests/browser/live-source.spec.ts tests/browser/profiles.spec.ts --workers=2 --retries=0`: 85 targeted cases across five profiles passed; no failures, retries or skips. Runtime and build files remained fixed throughout.
- `pnpm verify:distribution`: 27 tarballs inspected; SSR exports and isolated TypeScript consumer passed.
- Minimal/standard gzip: 38,969/57,848 bytes, within ceilings. No dependency changes.

All 30 upstream escape/line-break examples are tracked: 23 match under documented normalization; seven existing emphasis, raw-HTML, autolink, title and reference interactions remain explicit mismatches. The tests preserve code whitespace and normalize equivalent HTML quote/br spelling, block separators, soft breaks and ART's final code-line convention. See [compatibility scope](../markdown-compatibility.md).

This is targeted browser evidence. The [last full baseline](2026-09-16-surfaces.md) remains 470 cases. No full CommonMark/GFM claim, GitHub CI or public release. Physical-device/IME/screen-reader checks and release gates remain open.
