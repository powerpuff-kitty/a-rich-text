# List marker boundaries: local verification

Runtime/test revision: `0a4302f63289d282b672eaaa28fa7bf8804375d1`.
This revision includes draft increments #96–#102.

- `pnpm verify`: 1,160 unit tests across 88 files, package policy, builds, TypeScript/Vue checks and bundle ceilings passed.
- `node scripts/build-distribution.mjs`: browser distribution and showcase rebuilt.
- `pnpm exec playwright test tests/browser/markdown-compatibility.spec.ts tests/browser/live-source.spec.ts tests/browser/profiles.spec.ts tests/browser/autolink.spec.ts --workers=2 --retries=0`: all 180 targeted cases passed, 36 per profile; no failures, retries or skips. Runtime/build/test files remained fixed throughout this final run.
- `pnpm verify:distribution`: 27 tarballs inspected; SSR exports and isolated TypeScript consumer passed.
- Minimal/standard gzip: 40,629/59,525 bytes, within ceilings. No dependency or schema changes.

Thirteen unchanged upstream CommonMark 0.31.2 examples cover selected list-marker
boundaries. Twelve match retained ART semantics through HTML import, which removes
list-tightness differences and folds paragraph soft breaks. Example 267 explicitly
records zero-start lists normalizing to one under ART's positive-start constraint.
This subset does not cover the full List items or Lists sections. The initial
regression run reproduced 22 failures; the final marker suite contains 41 tests.

Non-one ordered markers and empty markers no longer interrupt open paragraphs,
including quote paragraphs. Isolated empty items and empty items inside lists are
preserved. Task-checkbox markers still interrupt even without trailing text.
Ordered markers require one to nine ASCII digits. Subsequent exported numbers stop
at the nine-digit limit so representable maximum starts retain multiple items.
Unicode separators within item text are preserved. Browser checks cover paragraph
and quote boundaries, empty list items, maximum starts and canonical reimport.

A preliminary browser run was stopped after review identified the empty-task
interruption edge case. Unit/build, browser and package checks above were rerun on
the final runtime revision; the machine-readable report describes only that run.

General list continuation, marker-style grouping, indentation/tab behavior and
tight/loose rendering remain incomplete. Zero starts and ART starts above
999,999,999 are outside this Markdown mapping. See
[compatibility scope](../markdown-compatibility.md) and
[machine-readable evidence](2026-09-18-list-markers.json).

This is targeted browser evidence; the [last full baseline](2026-09-16-surfaces.md)
remains 470 cases. No full CommonMark/GFM conformance, physical-device/IME or
screen-reader verification is claimed. No GitHub Actions or public release.
Existing documentation screenshots were not regenerated.
