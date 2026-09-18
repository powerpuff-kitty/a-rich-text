# Public API stability

## Current development contract

All packages are currently unpublished development version `0.0.0`. There is no
stable release or production compatibility promise. Integrators should pin an
exact package version or source revision and run the documented integration checks
before upgrading. Browser support means the evidence recorded in the
[compatibility matrix](compatibility.md), not an implied guarantee for every device.

The public surface consists of package `exports` and their TypeScript declarations,
documented custom-element properties/methods/events, documented attributes and CSS
parts, and the versioned ART document contract. Source paths, private fields,
rendered DOM structure, generated chunks and undocumented implementation details
are internal. Styling should use documented parts/tokens or supplied extension
hooks rather than depending on internal element structure.

## Compatibility rules

Package versions and ART document versions are separate. A package update does not
automatically migrate stored documents. Changes to validation or conversion can
also affect consumers without changing a function signature; record those effects
and their recovery path in the change description and release notes.

Before the first public release, development changes may be incompatible, but must
identify affected public surfaces and add relevant regression/consumer coverage.
The first release must publish its supported API and browser scope. During public
`0.x` releases, incompatible public-API changes require a new minor version;
patch releases preserve the documented API except where a security or correctness
fix must reject unsafe/invalid input, which must be called out explicitly. A `1.0`
release requires a separate readiness decision; it is not implied by this policy.

For supported releases, prefer additive APIs and a documented deprecation path.
Removal or renamed behavior needs an upgrade example and an appropriate breaking
version. Compatible packages must declare accurate dependency ranges; package
independence does not permit publishing incompatible combinations.

## Persistent data and extensions

The [schema decision](adr/0003-document-versioning.md) and
[migration contract](migrations.md) own root-version compatibility. Failed imports
or migrations must not overwrite the original saved data. Foreign formats have
explicit mappings and loss diagnostics; they are not alternate ART versions.

Extensions are trusted installed code with namespaced, JSON-safe document data.
Block/inline/mark envelopes, registry hooks and composition presets are supported within
their [documented boundaries](extensions.md). Atomic inline nodes use the [unpublished v1 compatibility contract](adr/0005-atomic-inline-extensions.md). Extension authors own payload migrations, including changes made
without changing the ART root version. Never reuse a namespace for incompatible
semantics or rely on private editor internals as a stable extension API.

## Verification and release boundary

Public surface changes require relevant unit/browser tests, TypeScript consumer
checks and package-export verification. The local commands in
[quality gates](quality.md) are the source of verification; this policy does not
enable hosted CI. Physical-device, IME, accessibility, performance and security
claims need their own recorded evidence.

Publication, npm ownership, release notes, governance and repository visibility
remain the separate work tracked by [#13](https://github.com/powerpuff-kitty/a-rich-text/issues/13).
This document sets the compatibility policy and does not authorize a release.
