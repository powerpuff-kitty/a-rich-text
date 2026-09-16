# Indented code: local verification

Runtime/test revision: `1c9e969eb37adf66199ecf0daaed2a30cbbfe443`.

- Initial new tests exposed 17 failures before implementation; two remaining upstream mismatches are explicitly documented (tight-list HTML wrappers and setext headings). All 88 Markdown tests pass, including the now-supported ATX heading example 69.
- `pnpm verify`: 647 unit tests across 78 files, builds, TypeScript/Vue, package policy and bundle ceilings passed.
- `node scripts/build-distribution.mjs`: browser distribution and examples built.
- `pnpm exec playwright test tests/browser/markdown-compatibility.spec.ts tests/browser/live-source.spec.ts tests/browser/profiles.spec.ts tests/browser/code-editor.spec.ts --workers=4 --retries=0`: 90 targeted cases across five profiles passed, zero failures/retries/skips. Runtime/build files stayed fixed during this run.
- `pnpm verify:distribution`: 27 offline tarballs, SSR export imports and isolated TypeScript consumer passed.
- Minimal/standard gzip: 38,735/57,630 bytes, within ceilings. No dependency changes.

This is targeted browser evidence. The [previous full baseline](2026-09-16-commonmark.md) passed 440 cases. No GitHub CI ran. Physical-device, IME, screen-reader and release gates remain open.

[Machine-readable evidence](2026-09-16-indented-code.json). [Compatibility scope](../markdown-compatibility.md): ten of twelve indented-code and all eighteen ATX heading examples match under the documented ART HTML/code-line normalization. Full CommonMark conformance is not claimed.
