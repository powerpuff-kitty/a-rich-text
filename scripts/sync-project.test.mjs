import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planReconciliation } from './sync-project.mjs';
const record = (url, type, state, merged = false) => ({ url, type, state, merged, title: url });
const item = (url, status) => ({ id: url, content: { url }, status });

test('preserves planned work and marks only resolved work Done', () => {
  const items = [item('active', 'In progress'), item('future', 'Backlog'), item('closed', 'In progress'), item('merged', 'In progress')];
  const records = [record('active', 'Issue', 'open'), record('future', 'Issue', 'open'), record('closed', 'Issue', 'closed'), record('merged', 'PullRequest', 'closed', true)];
  assert.deepEqual(planReconciliation(items, records).map(({ url, status }) => ({ url, status })), [{ url: 'closed', status: 'Done' }, { url: 'merged', status: 'Done' }]);
});
test('adds missing items and reopens stale Done cards', () => {
  const records = [record('issue', 'Issue', 'open'), record('pr', 'PullRequest', 'open'), record('reopened', 'Issue', 'open')];
  const plan = planReconciliation([item('reopened', 'Done')], records);
  assert.deepEqual(plan.map(({ url, status, action }) => ({ url, status, action })), [
    { url: 'issue', status: 'Backlog', action: 'add' }, { url: 'pr', status: 'In progress', action: 'add' }, { url: 'reopened', status: 'Backlog', action: 'status' },
  ]);
});
test('does not count abandoned PRs as shipped or remove unrelated cards', () => {
  assert.deepEqual(planReconciliation([item('abandoned', 'In progress'), item('unrelated', 'Done')], [record('abandoned', 'PullRequest', 'closed')]), []);
});
test('is idempotent after its proposed changes are applied', () => {
  const records = [record('issue', 'Issue', 'open'), record('pr', 'PullRequest', 'open')];
  const plan = planReconciliation([], records);
  assert.deepEqual(planReconciliation(plan.map(change => item(change.url, change.status)), records), []);
});

test('does not backfill absent completed history', () => {
  assert.deepEqual(planReconciliation([], [record('old-issue', 'Issue', 'closed'), record('old-pr', 'PullRequest', 'closed', true)]), []);
});
