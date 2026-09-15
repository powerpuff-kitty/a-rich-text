# Quality and release gates

A Rich Text treats reliability evidence as part of the product.

The project should not label a browser, device, accessibility workflow or performance target as supported merely because it appears in documentation. Claims must be backed by an executable test or an explicit manual verification record.

## Verification commands

```bash
pnpm verify
pnpm test:browser
```

`pnpm verify` is the non-browser release gate:

```text
package/dependency policy
workspace build
TypeScript typecheck
Vitest unit/security regression suite
bundled + gzipped size budgets
```

`pnpm test:browser` runs Playwright against the real built browser surface.

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

These are release budgets, **not current measured claims yet**. The current GitHub Actions runner problem (#15) prevents evidence generation in the hosted workflow. Once executable, the gate will either prove the budget or force optimization/budget review.

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

Current values intentionally include:

```text
configured-not-verified
not-verified
```

because GitHub-hosted jobs are currently blocked before runner allocation by issue #15.

When the browser job executes successfully, automated target results can be generated/promoted to verified evidence. Physical iPhone/Android, screen-reader, IME and mobile-keyboard checks remain manual unless backed by appropriate device infrastructure.

## Release rule

Before the first public npm release, at minimum:

1. CI runner #15 resolved;
2. `pnpm verify` green on a clean checkout;
3. Playwright browser matrix green for configured automated targets;
4. bundle budgets measured and passing (or consciously revised with evidence);
5. at least one physical iPhone + Android smoke pass;
6. keyboard-only and one screen-reader flow manually verified;
7. package tarball/public-export inspection completed;
8. known browser/IME limitations documented.

Production-readiness should be a testable state, not a branding adjective.
