# Empty blockquote preservation: local verification

Runtime/test revision: `e0df27dc66dd982873540a41497fadd9cd4a3c56`.
This revision includes draft increments #96–#100.

- `pnpm verify`: 1,103 unit tests across 87 files, package policy, builds, TypeScript/Vue checks and bundle ceilings passed.
- `node scripts/build-distribution.mjs`: browser distribution and showcase rebuilt.
- `pnpm exec playwright test tests/browser/markdown-compatibility.spec.ts tests/browser/live-source.spec.ts tests/browser/profiles.spec.ts tests/browser/autolink.spec.ts --workers=2 --retries=0`: all 160 targeted cases passed, 32 per profile; no failures, retries or skips. Runtime/build/test files remained fixed throughout the run.
- `pnpm verify:distribution`: 27 tarballs inspected; SSR exports and isolated TypeScript consumer passed.
- Minimal/standard gzip: 40,419/59,299 bytes, within ceilings. No dependency or schema changes.

All 25 upstream CommonMark 0.31.2 blockquote examples are tracked unchanged.
Eighteen match under documented block/soft-break, rule-spelling and final-code-line
normalization. Six lazy-continuation cases and one tight-list rendering case
remain explicit mismatches. Initial regressions reproduced twelve failures,
including both upstream empty-quote examples.

Empty quotes survive Markdown and HTML conversion, including nested/adjacent
quotes and quotes inside list items. HTML sanitization retains the empty container
while removing unsafe descendants/attributes. Unit coverage distinguishes an empty
quote from an explicit empty paragraph inside it. Browser coverage verifies exact
ART structure through visual, Markdown and HTML source views and reimport.
Empty-quote caret editing, arbitrary empty-paragraph Markdown fidelity and general
container/lazy-continuation conformance remain outside this increment.

See [compatibility scope](../markdown-compatibility.md) and
[machine-readable evidence](2026-09-18-blockquotes.json). This is targeted browser
evidence; the [last full baseline](2026-09-16-surfaces.md) remains 470 cases.
No full CommonMark/GFM conformance, physical-device/IME or screen-reader
verification is claimed. No GitHub Actions or public release. Existing
documentation screenshots were not regenerated.
