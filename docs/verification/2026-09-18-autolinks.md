# Markdown URI and email autolinks: local verification

Runtime/test revision: `ea5d8b77410df5232b8893faa9e95db0153cd9e4`.
This revision includes the preceding thematic-break increment.

- Initial autolink regressions reproduced eleven failures before implementation, including upstream URI/email rendering, literal punctuation, nested-link handling and angle-bracket destinations.
- `pnpm verify`: 849 unit tests across 83 files, package policy, builds, TypeScript/Vue checks and bundle ceilings passed.
- `node scripts/build-distribution.mjs`: browser distribution and showcase rebuilt.
- `pnpm exec playwright test tests/browser/markdown-compatibility.spec.ts tests/browser/live-source.spec.ts tests/browser/profiles.spec.ts tests/browser/autolink.spec.ts --workers=2 --retries=0`: all 120 targeted cases passed, 24 per profile; no failures, retries or skips. Runtime/build/test files remained fixed throughout the run.
- `pnpm verify:distribution`: 27 tarballs inspected; SSR exports and isolated TypeScript consumer passed.
- Minimal/standard gzip: 39,411/58,277 bytes, within ceilings. No dependency or schema changes.

All 19 upstream CommonMark 0.31.2 autolink examples are tracked unchanged.
Fifteen match; four deliberate scheme-policy exceptions assert literal output
instead of creating links outside the existing URL allowlist. Previously excluded
code-span example 346 and backslash example 20 now match. Tests also cover URI
encoding, code/formatting precedence, escaped/incomplete inputs, invalid Unicode,
blocked schemes and export/reimport. Browser coverage includes the existing
typed-space link detection and undo/redo behavior.

See [compatibility scope](../markdown-compatibility.md) and
[machine-readable evidence](2026-09-18-autolinks.json). This is targeted browser
evidence; the [last full baseline](2026-09-16-surfaces.md) remains 470 cases.
No full CommonMark/GFM conformance, physical-device/IME or screen-reader
verification is claimed. No GitHub Actions or public release. Existing
documentation screenshots were not regenerated.
