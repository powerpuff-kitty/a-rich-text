# Markdown paragraph whitespace: local verification

Runtime/test revision: `002c0f8e68a5f31343c13f3b0e5109b84f1b14d7`.
This revision includes the preceding thematic-break, autolink and emphasis increments.

- `pnpm verify`: 1,031 unit tests across 85 files, package policy, builds, TypeScript/Vue checks and bundle ceilings passed.
- `node scripts/build-distribution.mjs`: browser distribution and showcase rebuilt.
- `pnpm exec playwright test tests/browser/markdown-compatibility.spec.ts tests/browser/live-source.spec.ts tests/browser/profiles.spec.ts tests/browser/autolink.spec.ts --workers=2 --retries=0`: all 140 targeted cases passed, 28 per profile; no failures, retries or skips. Runtime/build/test files remained fixed throughout the run.
- `pnpm verify:distribution`: 27 tarballs inspected; SSR exports and isolated TypeScript consumer passed.
- Minimal/standard gzip: 40,342/59,220 bytes, within ceilings. No dependency or schema changes.

All 12 upstream CommonMark 0.31.2 Paragraphs, Blank lines and Textual content
examples are tracked unchanged and match under the documented block/soft-break,
HTML break spelling and final-code-line normalization. All also round-trip.
These fixtures preserve existing behavior; additional regressions establish the
Unicode data-loss fixes at document edges, on otherwise empty lines and in
container paragraphs. Non-ASCII quote indentation stays literal, and Unicode
line/paragraph separators inside quotes no longer stall the scanner.

Browser assertions compare exact text and ART state through source/visual
switching and reimport, including Unicode-only paragraphs. General container
conformance and arbitrary whitespace fidelity in other constructs remain outside
this increment.

See [compatibility scope](../markdown-compatibility.md) and
[machine-readable evidence](2026-09-18-paragraphs.json). This is targeted browser
evidence; the [last full baseline](2026-09-16-surfaces.md) remains 470 cases.
No full CommonMark/GFM conformance, physical-device/IME or screen-reader
verification is claimed. No GitHub Actions or public release. Existing
documentation screenshots were not regenerated.
