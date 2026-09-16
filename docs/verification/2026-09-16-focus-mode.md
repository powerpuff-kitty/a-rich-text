# Focus mode — local verification

Candidate: `712cd63533bd67cfe6cc2d17c3e9c15097416fd6`.
Date: 2026-09-16. Node 26.8.1, pnpm 10.17.1. GitHub Actions disabled.
Subsequent changes only add this evidence record.

## Results

- All 26 package policies, builds and typechecks passed, including strict Vue
  example template checks.
- 332 unit tests across 61 files passed.
- All 180 browser cases passed in the final full run, with no failures, retries
  or skips: Chromium, Firefox, WebKit, Pixel 7 Chromium and iPhone 15 WebKit
  emulation. Two workers, unchanged timeouts; 231.6 seconds.
- Minimal bundle: 28,716 bytes gzip / 51,200 budget.
- Standard bundle: 40,693 bytes gzip / 66,560 budget.
- All 26 tarballs passed inspection, isolated offline installation, DOM-free
  public-export imports and consumer TypeScript checks.
- Mobile (390 × 844) and desktop (1440 × 960) layouts were visually inspected.
  The mobile dialog measured 356px client/scroll width, without horizontal overflow.

The 25 new browser cases cover toolbar relocation/restoration, content and undo,
native FormData, source drafts, readonly inspection, keyboard return, nested
image/code dialogs, isolated link drafts, configuration changes, disabled fieldsets,
reset/disconnection, custom light-DOM styles and inert background controls.

Two earlier test expectations needed updating. Native dialog navigation can visit
browser chrome, so the test now checks that background page controls cannot receive
focus. An existing readonly test expected the entire toolbar to disappear; it now
requires that only the focus-inspection button remain visible. The initial full
run was stopped after identifying that obsolete expectation; the final full run
above passed. No production timeout or retry policy was relaxed.

## Reproduce

```sh
pnpm verify
node scripts/build-distribution.mjs
pnpm exec playwright test --workers=2
pnpm verify:distribution
```

The package/build/unit checks were run before the test-expectation-only correction;
the full browser and distribution checks then ran on the recorded candidate.
Local logs, browser JSON and screenshots are retained under ignored `test-results/`
as `focus-verify.log`, `focus-browser.log`, `focus-distribution.log`,
`focus-playwright-results.json`, `focus-mobile.png` and `focus-desktop.png`.

## Boundaries

Focus mode uses a native modal dialog, not the browser Fullscreen API. Custom
toolbar classes remain in light DOM, but selectors tied to old ancestors may no
longer match while expanded. Physical-device virtual keyboards, real IME and manual
screen-reader validation remain open. See [configuration](../editor-configuration.md#focus-mode),
[customization](../customization.md) and [remaining work](../remaining-work.md).
