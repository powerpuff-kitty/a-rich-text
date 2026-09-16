# Quote, rule and clear-formatting controls — local verification

Candidate: `b8ce9c796364b099e35352d8044f2103b7bb8261`.
Date: 2026-09-16. Local working checkout; Node 26.8.1, pnpm 10.17.1.
GitHub Actions remains disabled. No source changes followed verification.

## Evidence

`pnpm verify:local` passed:

- All 26 package policies, builds and typechecks.
- 329 unit tests across 61 files.
- 105 browser cases across Chromium, Firefox, WebKit, Pixel 7 Chromium and
  iPhone 15 WebKit emulation; no failures, flaky results or skips (142.2 seconds).
- Minimal bundle: 22,892 bytes gzip / 51,200 budget.
- Standard bundle: 34,384 bytes gzip / 66,560 budget.
- All 26 tarballs inspected, installed into an isolated offline consumer,
  imported without a DOM and checked against consumer TypeScript.

New cases cover quote wrapping/unwrapping with reversed selections, nested
multi-block quote mappings, horizontal-rule insertion with a trailing caret,
range/caret formatting removal, readonly protection, toolbar actions, undo and
configured visibility. A 390px preview was inspected: toolbar controls wrap and
there is no horizontal document overflow.

Local artifacts: `test-results/authoring-verify.log`,
`test-results/authoring-playwright-results.json` and
`test-results/authoring-mobile.png` (ignored).

## Boundaries

Quote commands target a single paragraph/heading selection and unwrap its
immediate quote container. Enter continues inside the quote; toggle the quote
button to leave it. Clear formatting removes inline marks and retains block
structure. Clearing caret marks affects subsequent typing, not existing text.

Dedicated code-block/image controls and focus mode remain future work. This run
does not establish physical-device, real-IME or manual screen-reader readiness.
See [configuration and remaining tools](../editor-configuration.md).
