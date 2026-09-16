# Customization and Vue/Tailwind integration — local verification

Candidate: `e8832e952d84baad1bd051f6baba946a5c2ea2bc`.
Date: 2026-09-16. Local working checkout; Node 26.8.1, pnpm 10.17.1.
GitHub Actions remains disabled. Subsequent changes only update documentation.

## Results

- All 26 package policies, builds and typechecks passed.
- Vue example strict template/type checks passed using vue-tsc 3.3.11 and the
  TypeScript 6 compatibility compiler. Editor packages still use TypeScript 7.0.2.
- 330 unit tests across 61 files passed.
- 130 browser cases passed across Chromium, Firefox, WebKit, Pixel 7 Chromium
  and iPhone 15 WebKit emulation: no failures, flaky cases or skips; 113 seconds.
- Minimal bundle: 24,592 bytes gzip / 51,200 budget.
- Standard bundle: 36,379 bytes gzip / 66,560 budget.
- All 26 tarballs passed inspection, isolated offline installation, DOM-free
  public-export imports and consumer TypeScript checks.

Browser coverage verifies external CSS parts after rerender/undo, custom button
pointer and keyboard selection retention, native form values, active-view parts,
compiled Tailwind arbitrary part variants, Vue v-model echo/undo behavior,
external values, readonly toggling and component unmount/remount. The Vue example
uses Vue 3.5.42 and Tailwind 4.3.3. Its 390px layout was inspected without horizontal
overflow. A targeted WebKit assertion initially compared floating-point CSS
serialization as an exact string; the final test compares the numeric line height
with subpixel tolerance.

Vue, Tailwind and their example tooling are development dependencies only.
Package policy still forbids framework runtimes in the editor packages. Vue and
Tailwind license files accompany their separate demo assets; the standalone
editor module does not acquire either runtime dependency.

## Reproduce

```sh
pnpm verify
node scripts/build-distribution.mjs
pnpm exec playwright test --workers=2
pnpm verify:distribution
```

This is the `verify:local` sequence with browser concurrency limited to two
workers. No timeouts or retries were changed. `pnpm verify:local` also includes
the new example typechecking/building and browser coverage.

Local artifacts are retained under ignored `test-results/`:
`customization-verify.log`, `customization-playwright-results.json` and
`customization-vue-mobile.png`.

## Boundaries

Examples are client-mounted integrations, not an SSR hydration implementation
or a separately published Vue adapter package. Physical-device, real-IME and
manual screen-reader evidence remain open. See [customization](../customization.md)
and [remaining work](../remaining-work.md).
