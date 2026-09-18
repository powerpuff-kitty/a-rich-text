# List grouping: local verification

Runtime/test revision: `0d557d5fd00b4713f9f052d8e5c74a0570c49a1f`.
This revision includes draft increments #96–#103.

- `pnpm verify`: 1,180 unit tests across 89 files, package policy, builds, TypeScript/Vue checks and bundle ceilings passed.
- `node scripts/build-distribution.mjs`: browser distribution and showcase rebuilt.
- `pnpm exec playwright test tests/browser/markdown-compatibility.spec.ts tests/browser/live-source.spec.ts tests/browser/profiles.spec.ts tests/browser/autolink.spec.ts --workers=2 --retries=0`: all 190 targeted cases passed, 38 per profile; no failures, retries or skips. Runtime/build/test files remained fixed throughout the run.
- `pnpm verify:distribution`: 27 tarballs inspected; SSR exports and isolated TypeScript consumer passed.
- Minimal/standard gzip: 40,706/59,607 bytes, within ceilings. No dependency or schema changes.

Three unchanged upstream CommonMark 0.31.2 examples (301, 302, 306) cover changed
bullet characters, changed ordered delimiters and blank lines between matching
markers. All three match retained ART semantics through HTML import, which removes
list-tightness differences and folds paragraph soft breaks. This subset does not
cover the full Lists section. The initial grouping regression run reproduced 13
failures; the final grouping suite contains 20 tests.

Changing the bullet character or ordered delimiter starts a separate list.
Matching markers retain one list across blank lines. Task lists use the same
bullet-marker boundary. Export alternates marker spelling between adjacent lists
of the same ART style, preserving separate list nodes at the document root and
inside blockquotes/list items. Coverage includes three consecutive lists, ordered
starts, task state and bullet items beginning with thematic breaks. Browser checks
verify separate visual lists, ordered starts, nested task lists and exact ART
structure after canonical Markdown reimport. Original marker spelling is not stored.

General list indentation, lazy continuation and tight/loose rendering remain
incomplete. This increment does not change the documented zero-start and
maximum-start model/mapping limits. See
[compatibility scope](../markdown-compatibility.md) and
[machine-readable evidence](2026-09-18-list-grouping.json).

This is targeted browser evidence; the [last full baseline](2026-09-16-surfaces.md)
remains 470 cases. No full CommonMark/GFM conformance, physical-device/IME or
screen-reader verification is claimed. No GitHub Actions or public release.
Existing documentation screenshots were not regenerated.
