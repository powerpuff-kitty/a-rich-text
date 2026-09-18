# Roadmap reconciliation

Project 19 is shared by `powerpuff-kitty/a-rich-text`, `arichtext.com` and
`a-rich-text-cloud`. Repository issues describe accepted scope; project Status is
the shared planning view. Do not count open PR cards as additional unfinished issues.

The saved remaining-work views filter `is:issue is:open`, with repository-specific
views for each product. Current board membership is explicitly reconciled. It does
not prove future automatic intake: the enabled GitHub auto-add workflow's repository
and filter configuration remain unverified through the available API.

## Local fallback

With an authenticated GitHub CLI account that can read all three repositories and
write Project 19, run from this repository:

```sh
node scripts/sync-project.mjs --check
node scripts/sync-project.mjs --apply
```

`--check` is read-only and exits 1 when drift exists. `--apply` adds missing open issues
and open PRs, then reconciles Status against live repository state. Run it
after creating, merging, closing or reopening tracked work and during roadmap
review. It reads all REST pages, rejects a truncated project listing and verifies
the result with fresh reads. It creates no issues, sends no comments, closes no
work and changes no repository, workflow or account settings.

Open issue planning is preserved. New open issues start in Backlog; new PRs start
In progress. Closed issues and merged PRs become Done. A reopened Done issue returns
to Backlog for triage. Closed-but-unmerged PRs are not treated as shipped and are
left for explicit review. Absent closed history is not re-added. Existing custom fields, other repositories and project
draft items are untouched; newly added items still need human Area/Phase/Priority
triage. Repeated application without repository changes is idempotent.

This is an explicit local maintenance process, not scheduled automatic intake.
GitHub Actions stays disabled. To replace it with built-in auto-add, verify and
record actual repository/filter coverage and the account's supported workflow count
in the Project settings, as tracked in #14. Linking repositories or enabling one
workflow does not prove coverage of all three.
