# Complete compatibility stack: local verification

Runtime/test revision: `4fa29f5fdd911165fec1f16f03bf044436f26d45`. This includes the Markdown stack #96–#105,
foundation documentation #106, and the toolbar focus-transfer/gallery deep-link fixes #107.
Runtime, build and test inputs remained fixed throughout the final full browser run.

The first full run at the previous runtime had 584 passes and one Chromium toolbar
failure. That failure reproduced twice in 15 isolated runs. A new unit regression
reproduced a synchronous editor-blur selection event closing the toolbar before
focus reached it; a focus-transfer guard fixes it. Twenty isolated Chromium runs
then passed with no retries. An earlier parallel-build test attempt had an unrelated
menu startup timeout (19 passes); the clean repeated run used fixed build outputs.

The second full run passed 584 cases and exposed a separate Firefox gallery
layout-shift failure. Gallery deep links now track lazy-frame resizing until user
interaction; 15 repeated cross-browser deep-link checks passed before adding the
explicit keyboard-release assertion to the final full run. Unit/package runtime
code did not change after the toolbar verification; the gallery/test change is
covered by the final browser run.

- `pnpm exec playwright test --workers=2 --retries=0`: all **585 cases passed**, 117 per profile; zero failures, retries or skips.
- Browser versions: Chromium 153.0.8010.12, Firefox 155.0, WebKit 26.6. Mobile profiles use Chromium/WebKit emulation, not physical devices.
- `pnpm verify` rerun after the toolbar fix (gallery-only follow-up does not change package runtime): 1,233 unit tests across 90 files, package policy, builds, TypeScript/Vue checks and bundle ceilings passed.
- `pnpm verify:distribution` rerun after the toolbar fix: 27 tarballs inspected; SSR imports and isolated TypeScript consumer passed. Package policy was rerun for the foundation documentation and validated all 27 packages.
- Minimal/standard gzip: 40,881/59,819 bytes. No dependency or schema changes.

Unit/build/bundle, package installation and browser verification were all rerun
after the focus fix. The final browser result replaces the older 470-case baseline.
The machine-readable report records the complete report hash, counts, versions and scope.

The run covers the existing editor/toolbar/gallery/source/profile surfaces,
selection/history/forms, image lifecycle, table editing, and the complete
Markdown stack #96–#105 together. It does not turn partial format mappings into
full CommonMark/GFM conformance or supply physical-device, real-IME, screen-reader,
production performance or external-provider evidence. Those gates remain open.
Documentation screenshots were not regenerated. GitHub Actions stays disabled;
no package publication or repository-visibility change is included.

[Machine-readable evidence](2026-09-18-integrated-stack.json) ·
[Completion plan](../plans/board-completion.md).
