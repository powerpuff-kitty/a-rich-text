# Contributing

A Rich Text is a browser-first, framework-independent rich-text editor. Start with
[architecture](docs/architecture.md), [API stability](docs/api-stability.md) and the
[remaining work](docs/remaining-work.md). Version 0.0.0 is a development snapshot.

Discuss feature scope in the corresponding GitHub issue before making a broad
change. A focused bug fix can go directly into a pull request with a reproduction.
Keep public APIs typed and optional features in their own packages. Do not add a
mandatory account, hosted service, model, framework or network dependency to the
base editor. Preserve document validation, explicit loss reporting and undo rules.

## Local workflow

Use the pnpm version pinned in `package.json`:

```sh
pnpm install --frozen-lockfile
pnpm verify
pnpm build:distribution
pnpm exec playwright install
pnpm test:browser
pnpm verify:distribution
```

`pnpm verify` covers package boundaries, builds, TypeScript, unit/security checks
and bundle budgets. Browser tests exercise the built distribution, so rebuild it
when browser runtime or examples change. Use focused browser tests while iterating;
run the required integration coverage before merging. Record the exact revision,
commands, counts and limits of the evidence. Emulation is not physical-device,
real-IME or screen-reader verification. GitHub Actions is currently disabled;
local evidence is required rather than an invented green CI result.

## Pull requests

Explain the user-visible problem, resulting behavior and verification. Link the
issue and identify supported boundaries, migration impact or conversion losses.
Add a regression test for a behavioral bug where it can meaningfully reproduce
failure. Update durable documentation and package declarations with API changes.
Keep generated output and unrelated files out of the diff. Do not commit secrets,
private cloud implementation, customer data or third-party content without rights.

Maintainers review changes before integration. A draft is not completed work;
close an issue only when its accepted scope is implemented and verified, or when
its owner explicitly resolves a scope change. Public release and repository
visibility changes follow the [release checklist](docs/release-checklist.md).

Participation follows the [Code of Conduct](CODE_OF_CONDUCT.md). Security reports
follow [SECURITY.md](SECURITY.md). Contributions are provided under this repository's
[MIT license](LICENSE); keep required third-party notices with redistributed code.
