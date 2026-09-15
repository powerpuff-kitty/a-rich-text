# Usable editor delivery

Outcome: a locally installable, framework-independent editor with working typing,
formatting, links, lists, tables, native forms, and a documented integration path.
GitHub Actions stays disabled. Public publication is outside this delivery.

1. Complete caret formatting/link and form state behavior. Verify real keyboard
   input, required validation, fieldset disabling/restoration and reset.
2. Complete optional list/table keyboard navigation with atomic transactions,
   preserved content and undo. Verify boundary behavior and cancellation.
3. Produce a standalone browser distribution and inspect/install actual package
   tarballs in an isolated consumer. Include license and usage documentation.
4. Run the entire local quality/browser suite, record measured evidence and known
   limitations, then synchronize the integrated code and GitHub tracking.

Each stage depends on the preceding API contracts. Changes remain on a feature
branch until validation passes; revert its commits to roll back. Existing ART v1
documents must remain readable. No schema migration or hosted service is required.

Done means the documented integration runs from built artifacts without workspace
resolution, all local gates pass, and limitations are explicit. Physical devices,
screen readers and real IMEs require external manual evidence before claiming the
full production release gate in `docs/quality.md`.
