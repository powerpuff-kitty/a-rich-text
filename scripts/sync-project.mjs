import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const execute = promisify(execFile);
const owner = 'powerpuff-kitty';
const projectNumber = '19';
const repositories = ['a-rich-text', 'arichtext.com', 'a-rich-text-cloud'];
async function gh(...args) {
  const { stdout } = await execute('gh', args, { maxBuffer: 32 * 1024 * 1024 });
  return stdout.trim() ? JSON.parse(stdout) : null;
}

/** Preserve deliberate open-issue planning; only actual resolved work becomes Done. */
export function planReconciliation(items, records) {
  const byURL = new Map(items.map(item => [item.content?.url, item]));
  return records.flatMap(record => {
    const item = byURL.get(record.url);
    // Do not repopulate intentionally absent/archived historical work.
    if (!item && record.state === 'closed') return [];
    const complete = record.type === 'Issue' ? record.state === 'closed' : Boolean(record.merged);
    // Closed-but-unmerged PRs are not represented as completed implementations.
    if (record.type === 'PullRequest' && record.state === 'closed' && !complete) return [];
    const fallback = record.type === 'PullRequest' ? 'In progress' : 'Backlog';
    const status = complete ? 'Done' : item?.status && item.status !== 'Done' ? item.status : fallback;
    if (item && item.status === status) return [];
    return [{ url: record.url, title: record.title, itemId: item?.id, status, action: item ? 'status' : 'add' }];
  });
}

async function readRecords() {
  const groups = await Promise.all(repositories.map(async repository => {
    const base = `repos/${owner}/${repository}`;
    const [issuePages, pullPages] = await Promise.all([
      gh('api', `${base}/issues?state=all&per_page=100`, '--paginate', '--slurp'),
      gh('api', `${base}/pulls?state=all&per_page=100`, '--paginate', '--slurp'),
    ]);
    return [
      ...issuePages.flat().filter(issue => !issue.pull_request).map(issue => ({ type: 'Issue', state: issue.state, url: issue.html_url, title: issue.title })),
      ...pullPages.flat().map(pull => ({ type: 'PullRequest', state: pull.state, merged: Boolean(pull.merged_at), url: pull.html_url, title: pull.title })),
    ];
  }));
  return groups.flat();
}
async function readItems() {
  const result = await gh('project', 'item-list', projectNumber, '--owner', owner, '--limit', '10000', '--format', 'json');
  if (result.items.length !== result.totalCount) throw new Error('Project items were truncated; refusing a partial reconciliation');
  return result.items;
}
async function main() {
  const [mode, ...extra] = process.argv.slice(2);
  if (!['--check', '--apply'].includes(mode) || extra.length) throw new Error('Usage: node scripts/sync-project.mjs --check|--apply');
  const [records, items, project, fields] = await Promise.all([
    readRecords(), readItems(),
    gh('project', 'view', projectNumber, '--owner', owner, '--format', 'json'),
    gh('project', 'field-list', projectNumber, '--owner', owner, '--format', 'json'),
  ]);
  const statusField = fields.fields.find(field => field.name === 'Status');
  const options = new Map(statusField?.options?.map(option => [option.name, option.id]));
  if (!statusField || ['Backlog', 'In progress', 'Done'].some(name => !options.has(name))) throw new Error('Expected shared Status options are missing');
  const changes = planReconciliation(items, records);
  console.log(JSON.stringify({ mode, repositories, changes }, null, 2));
  if (mode === '--check') { if (changes.length) process.exitCode = 1; return; }
  for (const change of changes) {
    const id = change.itemId ?? (await gh('project', 'item-add', projectNumber, '--owner', owner, '--url', change.url, '--format', 'json')).id;
    await gh('project', 'item-edit', '--id', id, '--project-id', project.id, '--field-id', statusField.id, '--single-select-option-id', options.get(change.status));
  }
  // Re-read both issue/PR states and board state to detect concurrent changes.
  const [afterItems, afterRecords] = await Promise.all([readItems(), readRecords()]);
  const remaining = planReconciliation(afterItems, afterRecords);
  console.log(JSON.stringify({ applied: changes.length, remaining }, null, 2));
  if (remaining.length) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
