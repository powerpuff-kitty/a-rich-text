# Public release and repository transition

This checklist prepares a release; it does not authorize publication, account
changes, paid plans, GitHub Actions enablement or making the repository public.
All packages currently use development version 0.0.0. The [API stability policy](api-stability.md)
separates package versions from ART document versions.

## Package and version policy

Release only packages under `packages/` whose manifests explicitly set public npm
access and whose packed contents pass local verification. The editor, converters
and optional local adapters in this repository are public-package candidates.
Website deployment, cloud implementation, billing, tenant administration, service
credentials and operational infrastructure are not npm package contents. Cloud
code belongs in the separate private cloud repository.

Before a release, select and record the package set and one coherent version for
that set. Update internal dependency ranges together, preserving valid workspace
links during development. Do not publish 0.0.0 as a supported release. Before 1.0,
breaking public API changes require a minor version and migration notes; compatible
fixes use patch versions. A stable 1.0 designation requires the policy's separate
readiness gates. ART v1 remains v1 unless the document schema changes through an
explicit, reviewed versioning decision.

Record an immutable source revision, changelog, package filenames and checksums.
Do not overwrite an existing npm version. Validate prereleases with a non-`latest`
dist-tag; promote only the approved version. On regression, move the dist-tag to a
known-good version, deprecate the affected version with guidance when appropriate,
and publish a fix. Do not assume consumers can be rolled back by a tag change or
unpublish packages as a routine recovery action.

## Required evidence before publishing

- [ ] Accepted scope and API documentation match the release candidate.
- [ ] Version changes, dependency ranges and migration notes are reviewed.
- [ ] `pnpm verify` and the relevant full built-browser suite pass at the candidate revision.
- [ ] `pnpm verify:distribution` inspects every tarball and verifies DOM-free imports and a TypeScript consumer.
- [ ] Inspect tarballs for secrets, private code, source maps and required licenses/notices.
- [ ] Complete or explicitly resolve the manual compatibility/release gates in #11 and #46; do not convert emulation into physical-device evidence.
- [ ] An authenticated npm owner verifies control of the `@arichtext` scope, all target names and required organization membership/2FA or trusted-publisher configuration.
- [ ] Verify package-name availability directly before publication. An unauthenticated 404 does not prove ownership or publishing permission.
- [ ] Choose and verify a supported provenance mechanism for the actual release environment. `publishConfig.provenance: true` alone is not provenance evidence.
- [ ] Obtain explicit approval for the concrete package set, versions, dist-tag and publication method.
- [ ] Publish, read back registry metadata and provenance, then install the published versions in a clean consumer.
- [ ] Record actual artifacts, registry URLs, verification and any rollback/deprecation actions.

On 2026-09-18, `npm whoami --registry=https://registry.npmjs.org` returned HTTP 401.
Publishing identity, scope ownership and live package-name permission therefore
remain unverified. Local packing succeeds without authenticating or publishing.
GitHub Actions remains disabled; a workflow file is not evidence of an operational
release pipeline. No token should be committed to satisfy these gates.

## Separate public repository transition

- [x] Repository license and package license metadata exist.
- [x] CONTRIBUTING.md, SECURITY.md and CODE_OF_CONDUCT.md exist.
- [ ] Confirm and test confidential security and conduct reporting routes, including an independent escalation contact.
- [ ] Review the complete Git history and release artifacts for secrets, private business code and data; deleting a current file does not remove history.
- [ ] Verify required third-party licenses and notices and resolve any publication restrictions.
- [ ] Publish actual support expectations and verify repository security/community settings.
- [ ] Confirm website/cloud repositories remain private where intended and public documentation exposes no operational secrets.
- [ ] Obtain explicit owner approval for the exact repository visibility change.
- [ ] Change visibility and read back the resulting state, links and access controls.

Publishing npm packages and making GitHub public are independent operations.
Completing this checklist's documentation does not mean either operation occurred.
