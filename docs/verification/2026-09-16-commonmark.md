# Markdown compatibility: local verification

Runtime/test revision: `fd270d2748c6dc597c5d32bb7165a249402189f3`.

- `pnpm exec vitest run packages/markdown/test`: 39 tests passed, including 20 supported upstream CommonMark code-span examples and two explicit known mismatches. These counts do not imply full dialect conformance.
- `pnpm verify`: 598 unit tests across 76 files, builds, TypeScript/Vue checks, package policy and bundle ceilings passed.
- `node scripts/build-distribution.mjs`: browser bundles and examples built.
- `pnpm verify:distribution`: 27 offline tarballs passed export/SSR imports and isolated TypeScript consumer checks.
- `pnpm exec playwright test --workers=4 --retries=0`: all 440 browser cases passed across five profiles (88 each), without failures, retries or skips. Test/assertion deadlines remain 30/5 seconds.
- Gzip sizes: minimal 38,584, standard 57,470 bytes; both within their ceilings.

A prior full run exposed an inline-toolbar focus race and was interrupted. A new unit regression failed before the fix and passed afterward; browser coverage now explicitly delivers the delayed selection event after Alt+F10. No failed/interrupted run is counted as passing evidence.

The full browser run used a fixed build and includes Markdown source/visual code-span regressions, existing editor behavior, configurable profiles, the optional Quill adapter and the component gallery. Existing component captures were not regenerated because styling is unchanged. All checks ran locally; no GitHub CI.

See [machine-readable evidence](2026-09-16-commonmark.json) for report/fixture hashes and [compatibility scope](../markdown-compatibility.md) for exact upstream examples, normalization and remaining gaps. The initial fixture comparison exposed equivalent HTML quote escaping; the harness normalizes this without changing code content or element structure. Literal link-destination backticks have an additional regression test.

Physical-device, IME, screen-reader and other manual/release gates remain open. This is a development snapshot, not a public release or full CommonMark conformance certification.
