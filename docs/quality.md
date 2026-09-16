# Quality and release gates

A Rich Text treats reliability evidence as part of the product.

Latest [full local verification](verification/2026-09-16-editor-showcase.md): 406 unit
tests, 330 browser cases across five profiles with default timeouts and no
retries/skips, and 26 package installation checks passed on the recorded revision.
Manual and physical-device gates below remain open.

The project should not label a browser, device, accessibility workflow or performance target as supported merely because it appears in documentation. Claims must be backed by an executable test or an explicit manual verification record.

## Verification commands

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium firefox webkit
pnpm verify:local
```

Run these checks locally. GitHub Actions availability is not a prerequisite for development or validation. Keep `pnpm-lock.yaml` with dependency changes so clean installations resolve the same versions.

The GitHub Actions workflow has been removed. Integration and release checks use the local commands above; merging or pushing this baseline does not schedule hosted CI.

`pnpm verify` is the non-browser release gate:

```text
package/dependency policy
workspace build
TypeScript typecheck
Vitest unit/security regression suite
bundled + gzipped size budgets
```

`pnpm test:browser` runs Playwright against the real built browser surface.

`pnpm verify:local` runs code checks, builds the standalone browser distribution,
tests that distribution in Playwright, then packs and installs all public packages
in an isolated consumer. Keep the console output and
`test-results/playwright-results.json` with the revision being reviewed; traces
are retained for failed browser tests. See [configuration verification](verification/2026-09-16-configuration.md),
[integration verification](verification/2026-09-15-usable.md)
and the earlier [foundation verification](verification/2026-09-15-local.md).

`pnpm test:browser` expects `pnpm build:distribution` first. To exercise the Vite
source fixture during development, set `ART_BROWSER_FIXTURE=/tests/browser/`.
Paste fixtures deliver synthetic clipboard events with real browser DOM parsing;
they do not certify the operating-system clipboard. Keyboard toolbar fixtures
exercise activation after focus transfer, not a manual screen-reader session.

## Package policy

`scripts/validate-packages.mjs` validates public package metadata and architecture boundaries.

It requires:

- `@arichtext/<folder>` package naming;
- MIT license;
- ESM package type;
- public npm access;
- npm provenance;
- type + ESM root exports;
- correct repository-directory metadata;
- every internal runtime import to be declared as a dependency/peer dependency.

Framework runtimes are forbidden from the framework-neutral workspace packages.

The base Web Component is additionally forbidden from acquiring optional service/capability packages such as:

```text
media
collaboration
AI
annotations/comments/suggestions
```

This makes the modular bundle boundary machine-enforceable instead of architectural prose.

## Mandatory-network policy

The core browser/editor packages are scanned for direct mandatory network primitives:

```text
fetch()
new WebSocket()
new EventSource()
new XMLHttpRequest()
```

The intent is not to claim these APIs are insecure. The intent is to enforce the product contract that the base editor does not contact A Rich Text or any third party merely because it was imported/created.

Optional adapter packages may use host-provided network services where their feature requires them.

## Bundle budgets

Bundle measurement uses esbuild against real public entry imports, then gzip level 9.

Initial hard ceilings:

| Entry | Budget |
|---|---:|
| Minimal `<a-rich-text>` | 50 KiB gzip |
| Standard editor + toolbar | 65 KiB gzip |

The entries live under `quality/entries/` and the limits under `quality/bundle-budgets.json`.

Local measurements and the exact verification environment are recorded in the [verification evidence](verification/2026-09-15-local.md). Run the budget gate after implementation changes; measurements apply to that source and lockfile, not every future build.

A budget should be changed only after feature-matched measurement, not to hide a regression.

## Real-browser matrix

Playwright is configured for:

```text
Chromium desktop
Firefox desktop
WebKit desktop
Pixel 7 Chromium emulation
iPhone 15 WebKit emulation
```

The smoke suite covers:

- custom-element registration;
- accessible textbox semantics;
- native contenteditable typing;
- undo;
- form-associated serialization;
- toolbar commands/focus;
- readonly protection;
- extension fallback rendering.
- list Enter/exit and atomic undo;
- table insertion and row/column controls.

Emulation is not equivalent to physical-device verification.

## Accessibility

The actual focusable shadow textbox owns:

```text
role=textbox
aria-multiline=true
```

Host ARIA labelling/state attributes are mirrored dynamically to that focusable surface:

```text
aria-label
aria-labelledby
aria-describedby
aria-required
aria-invalid
```

`placeholder` is also exposed as `aria-placeholder`.

`aria-labelledby` and `aria-describedby` IDs are resolved in the host's tree and assigned to the editable surface through element-reference properties. Copying ID strings into a shadow root alone cannot resolve external elements. See [ARIA element references](https://developer.mozilla.org/en-US/docs/Web/API/Element/ariaLabelledByElements). Referenced elements must exist when the editor connects or the host ARIA attributes change; direct `aria-label` remains available. Native accessible naming is tested through Chromium's accessibility tree; other targets verify the reflected references and textbox semantics. Playwright's DOM-based name matcher does not currently account for those cross-root references.

`readonly`/`disabled` update both editability and ARIA state.

Automated checks are necessary but insufficient for editor accessibility. Manual screen-reader/device verification is tracked separately in `quality/compatibility-matrix.json`.

## Security fixtures

The regression suite includes adversarial content paths for:

- executable/embed HTML elements;
- inline event handlers;
- arbitrary inline/class styling on clipboard input;
- mixed-case/entity-obfuscated unsafe URL protocols;
- unsafe extension HTML descriptors;
- `href` / `src` protocol enforcement;
- non-finite/runtime extension JSON values;
- excessive ART nesting;
- malformed list/table/custom-node structures.

The security boundary remains:

```text
untrusted HTML/clipboard
        ↓
allowlisted parser / ART validation
        ↓
canonical ART
        ↓
safe DOM construction / escaped serialization
```

## Compatibility evidence statuses

`quality/compatibility-matrix.json` uses explicit evidence states.

Automated targets with a recorded passing local run are marked `verified-local` and link to dated evidence. Physical iPhone/Android, screen-reader, IME and mobile-keyboard checks remain `not-verified` until backed by appropriate device or manual evidence. A passing smoke matrix is not a blanket browser support claim.

## Release rule

Before the first public npm release, at minimum:

1. local validation evidence retained for the release candidate and lockfile;
2. `pnpm verify` green on a clean checkout;
3. Playwright browser matrix green for configured automated targets;
4. bundle budgets measured and passing (or consciously revised with evidence);
5. at least one physical iPhone + Android smoke pass;
6. keyboard-only and one screen-reader flow manually verified;
7. package tarball/public-export inspection completed;
8. known browser/IME limitations documented.

Production-readiness should be a testable state, not a branding adjective.
