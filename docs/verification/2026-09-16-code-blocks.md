# Code-block authoring — local verification

Candidate: `d9026272fbebe290a895b801f64604ad3011d9f6`.
Date: 2026-09-16. Local working checkout, Node 26.8.1, pnpm 10.17.1.
GitHub Actions remains disabled. No source changes followed this verification.

## Results

`pnpm verify:local` completed successfully:

- All 26 package policies, builds and typechecks passed.
- 330 unit tests across 61 files passed.
- All 120 browser cases completed across Chromium, Firefox, WebKit, Pixel 7
  Chromium and iPhone 15 WebKit emulation: 119 passed immediately, one passed on
  retry. Browser execution took approximately 4.6 minutes.
- Minimal bundle: 24,396 bytes gzip / 51,200 budget.
- Standard bundle: 36,186 bytes gzip / 66,560 budget.
- All 26 tarballs passed inspection, isolated offline installation, DOM-free
  public-export imports and consumer TypeScript validation.

The new code-dialog cases passed on all five profiles. They cover creation,
editing, removal, undo, nested imported code, language validation, draft
isolation, HTML/Markdown round-tripping, native reconciliation, keyboard entry,
Escape focus restoration, stale writes, configuration, locks and form reset.
Initial targeted testing exposed a WebKit focus-restoration defect; the final
candidate fixes it by explicitly retaining the originating block's edit button.

## Timing qualification

The existing mobile WebKit task-checkbox case exceeded its 30-second timeout
once in the full suite, then passed on retry. Its failure snapshot showed the
checkbox had changed successfully. Three additional single-worker runs without
retries yielded two passes and one timeout in `beforeEach` page loading, before
the test's assertions began. Host load was observed above 90 on eight logical
CPUs (and briefly above 340). This supports host contention as the likely cause;
it does not prove timing stability. No test, timeout or assertion was weakened.

The full run is therefore **not a zero-flake result**. Logs retain both the
successful pipeline and the isolated timing failure. No functional assertion
failure remained in the new feature's final browser cases.

## UX and boundaries

The code dialog was inspected at 390px: its content fits without horizontal
overflow. Code remains plain, inert text with optional language metadata; syntax
highlighting is not provided. Code blocks are atomic in the visual surface and
edited through the dialog or source views. Configuration/lock/reset/disconnect
changes close and discard a draft; concurrent document edits retain the draft
but reject Apply/Remove. See [configuration](../editor-configuration.md).

Physical-device, real-IME and manual screen-reader verification remain open.

## Reproduce and artifacts

```sh
pnpm verify:local
pnpm exec playwright test tests/browser/configuration.spec.ts \
  --project=mobile-webkit --grep 'task text aligns' \
  --workers=1 --retries=0 --repeat-each=3
```

Ignored local artifacts: `test-results/code-blocks-verify.log`,
`test-results/code-blocks-isolated.log`,
`test-results/code-blocks-isolated-results.json` and
`test-results/code-dialog-mobile.png`.
