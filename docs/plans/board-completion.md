# Finish the active project work

Snapshot: 2026-09-18. Initial scope is Project 19's current In progress work:
12 issues and draft PRs #96–#105. The separate 21-open-issue count also includes
nine Backlog issues across editor, website and cloud. Do not treat a PR card as
another independent product ticket. Expand this plan to the Backlog only when that
scope is selected.

## Completion rule

Close an issue only when its accepted deliverables are implemented, verified and
integrated, with evidence in its body. An implementation PR being locally green is
not the same as being integrated. Do not replace manual evidence with browser
emulation, infer publication from `npm pack`, or hide unfinished work by moving a
card to Done. Added roadmap work must have an explicit scope decision before it is
deferred from an umbrella issue.

## Sequence and closing conditions

| Order | Ticket | Concrete remaining work | Closing evidence / dependency |
| --- | --- | --- | --- |
| 1 | #1 Foundation | API stability policy; schema-versioning and persistence ADRs; current package boundaries | Linked/indexed documents agree with implementation; local dependency policy and zero-network baseline; integrate the documentation change |
| 2 | #7 Local-first | Snapshot comparison; offline reload/recovery; quota and corrupt/incompatible record paths | Real-browser integration tests with no required remote data service, plus explicit failure/recovery behavior; comparison can reuse the document-diff contract needed by #9 |
| 3 | #6 Extensions | Custom inline atomic nodes and adoption contract | Agreed ART/selection/operation semantics, JSON Schema and converters, rendering/cursor/clipboard/history tests, package consumer example; depends on #1's stability policy |
| 4 | #10 AI | Typed structured-edit proposals, suggestion integration, local WebGPU/WASM example | Review/reject/apply and stale-proposal tests; no required hosted provider; local-model example with actual runtime evidence and documented browser/hardware limits |
| 5 | #9 Collaboration | Document diff, Yjs concurrency adapter, production review UI/provider integration | Multi-client concurrent edits converge; offline/reconnect/error behavior; comments/suggestions remain valid and host-owned persistence works; transport-independent integration tests |
| 6 | #4 Editor | Broader structural selection editing and the block/formatting work tracked by #74/#75 | Explicitly include those dependent tickets or obtain a scope decision; selection, keyboard, history, serialization and browser tests for the agreed authoring surface |
| 7 | #2 Interoperability | Integrate existing Markdown fixes; complete the agreed CommonMark/GFM and foreign-adapter follow-ups | Full-stack regression run; documented mappings/loss reporting; remaining scope must name the target dialect/features/adapters rather than imply universal interchange |
| 8 | #8 Media | Physical-browser orientation/image evidence and provider/clipboard end-to-end checks | Recorded browser/device/file matrix, insertion/upload retry/cancel/error evidence; no claim that emulation proves physical-device behavior |
| 9 | #11 and #46 Quality | Full current browser baseline, accessibility/security/performance/RTL/clipboard checks; real devices, IME and screen readers | Executable local evidence plus named manual records; update compatibility matrix; retain any failed/unverified gate explicitly |
| 10 | #13 Distribution | Release/version policy, governance/security documents, npm ownership and publication readiness | Verified package contents, explicit release target/ownership and publication decision; repository visibility is a separate action; keep hosted CI disabled |
| 11 | #14 Project setup | Verify actual auto-add repository/filter coverage or accept an explicit alternative intake process | Authenticated Project workflow settings evidence for all three repositories, including plan limitations; current membership alone is insufficient |

The code-heavy steps can share prerequisites: document comparison supports #7 and
#9; selection/operation semantics support #6, #4 and structured AI proposals. Do
not implement incompatible versions independently. No new provider credentials or
paid infrastructure are assumed.

## Existing draft stack

Validate the complete #96 → #105 stack before integration, keeping runtime/build
inputs fixed during verification. The latest increment already has 1,232 unit
tests, 200 targeted browser cases and 27 package checks; run the full browser suite
to replace the older 470-case baseline. Preserve per-PR evidence and dependency
order when integrating. Retain branches used by evidence links until those links
have been made durable. Do not publish packages as part of merging code.

## External evidence and decisions

Physical iPhone/Android, real IME and screen-reader results require the relevant
devices/tools and a recorded tester. npm ownership/publication and repository
visibility require the corresponding account state and explicit release scope.
Project workflow filters currently require authenticated UI inspection because
the available API does not expose their configuration. These are completion
requirements, not reasons to stop independent code or documentation work.

The intended interoperability scope (#2), inline-node schema/selection behavior
(#6), authoring scope (#4/#74/#75), and release target (#13) must be explicit before
their final closure. Recommend concrete contracts backed by existing architecture;
do not manufacture product approval or quietly reduce the listed scope.

## Verification and rollback

Run relevant unit/browser/consumer checks at each implementation boundary, then
the full local gates for the integrated candidate. Keep schema changes explicit,
preserve original persisted data on failed migration/recovery, and test a read-only
failure path for unsupported versions. Provider features stay opt-in so hosts can
remove their adapters independently. Revert a faulty integrated increment while
preserving its evidence and reopening the affected ticket; never roll back user
data by silently rewriting it to an older schema.
