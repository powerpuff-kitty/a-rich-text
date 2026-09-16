# Find and replace — local verification

Candidate: `c0bb2ac3d59d9d67692302c7654d469afaacc52f`.
Date: 2026-09-16. Node 26.8.1, pnpm 10.17.1. GitHub Actions disabled.
Subsequent changes only add this evidence record.

## Results

- All 26 package policies, builds and typechecks passed, including strict Vue
  example template checks.
- 339 unit tests across 62 files passed.
- The final full browser run completed all 205 cases: 204 first-pass successes,
  one success on retry, no remaining failures and no skips. Profiles: Chromium,
  Firefox, WebKit, Pixel 7 Chromium and iPhone 15 WebKit emulation.
- Minimal bundle: 30,946 bytes gzip / 51,200 budget.
- Standard bundle: 43,411 bytes gzip / 66,560 budget.
- All 26 tarballs passed inspection, isolated offline installation, DOM-free
  public-export imports and consumer TypeScript checks.
- The 390px inline and focus-mode layouts were visually inspected. The inline
  panel measured 372px client/scroll width without horizontal overflow.

The 25 new browser cases cover literal search across marks and nested text,
wrapped navigation, current-match highlighting, replacement formatting, atomic
undo, native FormData, case/word options, readonly/tool/source locks, focus mode,
nested dialogs, synthetic composition, reconciliation, reset and disconnection.
An additional check found that external document replacement could leave the
editor selection behind the updated highlight. The candidate fixes this, with
coverage verifying that closing Find and typing replaces the highlighted result.
Engine/DOM tests cover Unicode offsets, word boundaries, literal metacharacters,
non-overlapping replacements, unchanged-text no-ops and hard-break range mapping.

## Timing qualification

This is functional evidence with an environment qualification, **not a clean run
at the default 30-second test budget**. Earlier two-worker and one-worker runs
hit timeouts during page loading/basic actions while the host was heavily loaded.
They were stopped; the final run used one worker and a 90-second overall test
budget. The 5-second assertion timeout and one-retry policy were unchanged.
No repository timeout setting was changed. Final duration: 1,039.4 seconds.

The flaky case was the existing Firefox code-block creation/editing case. Its
first attempt exceeded the overall budget; its retry passed. Trace timestamps
also showed substantial delays outside completed browser actions. An isolated
run of that same case with tracing disabled passed in 11.1 seconds. This suggests
host/tracing overhead contributed, but does not establish a single cause.
The accepted full run retained the normal failure-trace capture setting.

## Reproduce

```sh
pnpm verify
node scripts/build-distribution.mjs
pnpm exec playwright test --workers=1 --timeout=90000
pnpm verify:distribution
```

Local artifacts in ignored `test-results/` include `find-verify.log` (also includes
an interrupted browser attempt), `find-browser-final.log`, `find-distribution.log`,
`find-playwright-results.json`, `find-firefox-no-trace.log`, timing-failure reports,
the retained Firefox failure trace and the two `find-*-mobile.png` screenshots.

## Boundaries

Search covers editable paragraph/heading text, including nested containers; it
does not search atomic code blocks or image/extension metadata. Whole-word search
uses Unicode character boundaries, not locale-specific dictionary segmentation.
Physical-device/real-IME, screen-reader and large-document performance checks
remain open. See [configuration](../editor-configuration.md#find-and-replace),
[customization](../customization.md) and [remaining work](../remaining-work.md).
