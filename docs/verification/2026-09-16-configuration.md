# Configurable toolbar and source views — local verification

Candidate: `b01717b45f7bd7fc6dfcfca761b5ea9cff020c86`.
Date: 2026-09-16. Detached clean checkout, frozen offline install;
macOS 15.7.9, Node 26.8.1, pnpm 10.17.1. GitHub Actions remains disabled.

## Evidence

- All 26 package policies, builds and typechecks passed.
- 324 unit tests across 61 files passed.
- 100 browser cases passed across Chromium, Firefox, WebKit, Pixel 7 Chromium
  emulation and iPhone 15 WebKit emulation: no failures, flaky results or skips.
  Browser execution took 63.5 seconds.
- Minimal bundle: 22,520 bytes gzip / 51,200 budget.
- Standard bundle including the Font Awesome SVG subset: 33,514 bytes gzip /
  66,560 budget.
- All 26 tarballs passed inspection, isolated offline installation, public-export
  imports and consumer TypeScript checks.
- Desktop and 390px-wide renders were inspected locally for checkbox/text
  alignment, removal of duplicate task bullets and toolbar wrapping.

New browser cases exercise placeholder/caret alignment, canonical task checkbox
changes and undo, contextual toolbar visibility, SVG accessibility attributes,
developer tool/view allowlists, disabled formatting shortcuts, HTML/Markdown/JSON
source editing, unmodified-view fidelity, invalid JSON recovery, pending-draft
form validation and readonly views. Unit cases additionally exercise concurrent
external document updates and attempts to remove a view with a pending draft.

The standard pipeline inspects all 26 tarballs, installs them into an isolated
offline consumer, imports every entry without a DOM and checks a TypeScript
integration including the new configuration properties. Font Awesome attribution
is required in the UI tarball and included with the browser distribution.

## Reproduce

```sh
pnpm install --frozen-lockfile
pnpm verify:local
```

The browser matrix loads the standalone `dist/browser/` bundle. Exact local logs
and the Playwright JSON report are retained under ignored `test-results/` paths.

## Boundaries

Source Apply deliberately uses the existing import/setter contract and clears
undo history. The UI states this before application. Merely switching views is
non-mutating. Markdown and text are not lossless substitutes for ART JSON.

This run does not establish physical-device, real-IME, OS clipboard or manual
screen-reader certification. Existing production gates remain open. See
[configuration and missing tools](../editor-configuration.md) and the
[quality contract](../quality.md).
