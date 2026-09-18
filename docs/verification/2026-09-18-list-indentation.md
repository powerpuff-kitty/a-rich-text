# List content indentation and continuation: local verification

Runtime/test revision: `770efc1d17e886313395d9bc2b56f438b95bd705`.
This revision includes draft increments #96–#104.

- `pnpm verify`: 1,232 unit tests across 90 files, package policy, builds, TypeScript/Vue checks and bundle ceilings passed.
- `node scripts/build-distribution.mjs`: browser distribution and showcase rebuilt.
- `pnpm exec playwright test tests/browser/markdown-compatibility.spec.ts tests/browser/live-source.spec.ts tests/browser/profiles.spec.ts tests/browser/autolink.spec.ts --workers=2 --retries=0`: all 200 targeted cases passed, 40 per profile; no failures, retries or skips. Runtime/build/test files remained fixed throughout the run.
- `pnpm verify:distribution`: 27 tarballs inspected; SSR exports and isolated TypeScript consumer passed.
- Minimal/standard gzip: 40,881/59,792 bytes, within ceilings. No dependency or schema changes.

Thirty-one unchanged upstream CommonMark 0.31.2 examples cover selected item
indentation and continuation cases. All match retained ART semantics through HTML
import after removing block separators (including before nested lists), folding
paragraph soft breaks and omitting the final code line terminator. Internal code
whitespace is preserved; tight/loose paragraph wrappers are not stored. This is
selected coverage, not the full List items section. The initial 29-test regression
run reproduced ten failures; the final indentation suite contains 52 tests.

Each item's content boundary follows its marker width and whitespace padding.
Larger padding retains code indentation; initially empty items end at a second
blank line. Shared source positions let open paragraphs continue with omitted
indentation without reparsing growing prefixes. Closed paragraphs and other block
collectors respect item boundaries. Coverage includes wide ordered markers,
numbering-width transitions, nested quotes/lists, task child blocks, partial-tab
spaces, literal code tabs and 2,000-line paragraph/blank runs. Task child blocks
export at the bullet content column rather than the checkbox width. Browser tests
verify nested code/tab/list structure, lazy paragraphs, task quote/code children
and exact ART structure after canonical Markdown reimport.

Variable sibling indentation, broader nested-container/tab interactions and
tight/loose rendering remain incomplete or unverified. The documented zero-start
and maximum-start mapping limits remain. See
[compatibility scope](../markdown-compatibility.md) and
[machine-readable evidence](2026-09-18-list-indentation.json).

This is targeted browser evidence; the [last full baseline](2026-09-16-surfaces.md)
remains 470 cases. No full CommonMark/GFM conformance, physical-device/IME or
screen-reader verification is claimed. No GitHub Actions or public release.
Existing documentation screenshots were not regenerated.
