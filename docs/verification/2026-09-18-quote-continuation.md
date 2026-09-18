# Blockquote paragraph continuation: local verification

Runtime/test revision: `cf9877e652e6b7d00ed4466ecae1e24a5300edd0`.
This revision includes draft increments #96–#101.

- `pnpm verify`: 1,119 unit tests across 87 files, package policy, builds, TypeScript/Vue checks and bundle ceilings passed.
- `node scripts/build-distribution.mjs`: browser distribution and showcase rebuilt.
- `pnpm exec playwright test tests/browser/markdown-compatibility.spec.ts tests/browser/live-source.spec.ts tests/browser/profiles.spec.ts tests/browser/autolink.spec.ts --workers=2 --retries=0`: all 170 targeted cases passed, 34 per profile; no failures, retries or skips. Runtime/build/test files remained fixed throughout the run.
- `pnpm verify:distribution`: 27 tarballs inspected; SSR exports and isolated TypeScript consumer passed.
- Minimal/standard gzip: 40,552/59,438 bytes, within ceilings. No dependency or schema changes.

All 25 upstream CommonMark 0.31.2 blockquote examples remain unchanged.
Twenty-four match under documented block/soft-break, rule-spelling and
final-code-line normalization. Tight-list rendering example 235 remains an
explicit mismatch. Previously failing examples 232, 233, 238, 247, 250 and 251,
plus setext example 93, now match. The initial regression run reproduced
fourteen failures.

Open quote paragraphs consume continuation lines with omitted markers, including
partially marked nested quotes and inline emphasis/code spanning those lines.
Other block collectors stay within their explicit quote boundary. Regression
coverage includes headings, fences, code, blank boundaries, list/table boundaries,
inline marks and 2,000 alternating marked/unmarked paragraph lines. Shared source
positions avoid reparsing each growing paragraph prefix. Browser checks verify
nested quote depth, inline formatting, canonical reimport and setext boundaries.
General list-contained continuation, list-marker interruption, container tabs and
indentation, empty-quote caret editing and arbitrary empty-paragraph Markdown
fidelity remain outside this increment.

See [compatibility scope](../markdown-compatibility.md) and
[machine-readable evidence](2026-09-18-quote-continuation.json). This is targeted
browser evidence; the [last full baseline](2026-09-16-surfaces.md) remains 470 cases.
No full CommonMark/GFM conformance, physical-device/IME or screen-reader
verification is claimed. No GitHub Actions or public release. Existing
documentation screenshots were not regenerated.
