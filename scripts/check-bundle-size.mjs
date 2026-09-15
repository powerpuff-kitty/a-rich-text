import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';

const root = process.cwd();
const budgets = JSON.parse(await readFile(path.join(root, 'quality/bundle-budgets.json'), 'utf8'));
const failures = [];
const report = {};

for (const [name, config] of Object.entries(budgets)) {
  const result = await build({
    entryPoints: [path.join(root, config.entry)],
    bundle: true,
    minify: true,
    treeShaking: true,
    platform: 'browser',
    format: 'esm',
    target: ['es2022'],
    write: false,
    metafile: true,
    legalComments: 'none',
  });

  const bytes = result.outputFiles.reduce((sum, file) => sum + file.contents.byteLength, 0);
  const combined = Buffer.concat(result.outputFiles.map((file) => Buffer.from(file.contents)));
  const gzipBytes = gzipSync(combined, { level: 9 }).byteLength;
  const max = Number(config.maxGzipBytes);
  const target = Number(config.targetGzipBytes ?? max);

  report[name] = {
    entry: config.entry,
    minifiedBytes: bytes,
    gzipBytes,
    maxGzipBytes: max,
    targetGzipBytes: target,
  };

  const pct = ((gzipBytes / max) * 100).toFixed(1);
  console.log(`${name.padEnd(12)} ${formatBytes(gzipBytes)} gzip / ${formatBytes(max)} max (${pct}%)`);
  if (gzipBytes > max) failures.push(`${name}: ${gzipBytes} gzip bytes exceeds ${max}`);
}

console.log(`\n${JSON.stringify(report, null, 2)}`);

if (failures.length > 0) {
  console.error('\nBundle size gate failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
}

function formatBytes(value) {
  return `${(value / 1024).toFixed(1)} KiB`;
}
