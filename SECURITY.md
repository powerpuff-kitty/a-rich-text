# Security policy

A Rich Text 0.0.0 is an unreleased development snapshot. There is no supported
production release line or promised security response SLA yet. Release support
windows must be published with the first public version.

## Reporting

Do not disclose an unpatched vulnerability in a public issue, discussion or pull
request. Use GitHub's private vulnerability reporting **if it is enabled for this
repository**. Otherwise contact the repository owner, `powerpuff-kitty`, through
an existing private channel to arrange a confidential report. A verified reporting
route is a prerequisite for making the repository public; this document does not
claim that the GitHub reporting feature is enabled.

Include affected revisions/packages, a minimal reproduction, expected versus
observed behavior and the potential impact. Use synthetic data and redact secrets.
Do not send credentials, user documents or an exploit against someone else's
service. Coordinate any disclosure timing with the maintainers.

Maintainers will assess scope and reproducibility, prepare a fix and regression
coverage, identify affected versions, and coordinate an advisory and release where
needed. No fixed response or remediation time is promised for this development
project. Release notes must identify security-relevant behavior changes, including
validation tightening; see the [API policy](docs/api-stability.md).

## Boundaries

Conversion and paste inputs, serialized documents and extension data are untrusted.
Host applications remain responsible for authorization, tenancy, provider
credentials, upload storage and their own extension code. Keep secret provider
keys out of browser bundles. Optional integrations must preserve the base editor's
ability to work without a server or account. See [quality and security gates](docs/quality.md)
and the [release checklist](docs/release-checklist.md) for current controls and gates.
