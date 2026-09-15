import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const destination = path.join(root, 'dist/packages');
await mkdir(destination, { recursive: true });
const manifests = [];
const tarballs = [];
for (const directory of (await readdir('packages')).sort()) {
  const cwd = path.join(root, 'packages', directory);
  const manifest = JSON.parse(await readFile(path.join(cwd, 'package.json'), 'utf8'));
  execFileSync('pnpm', ['pack', '--pack-destination', destination], { cwd, stdio: 'pipe' });
  const tarball = path.join(destination, `${manifest.name.replace('@', '').replace('/', '-')}-${manifest.version}.tgz`);
  const entries = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' }).split('\n');
  for (const file of ['package/README.md', 'package/LICENSE']) assert(entries.includes(file), `${manifest.name}: missing ${file}`);
  for (const value of Object.values(manifest.exports)) {
    for (const file of Object.values(value)) assert(entries.includes(`package/${file.replace(/^\.\//, '')}`), `${manifest.name}: missing export ${file}`);
  }
  const packed = JSON.parse(execFileSync('tar', ['-xOzf', tarball, 'package/package.json'], { encoding: 'utf8' }));
  assert(!JSON.stringify(packed).includes('workspace:'), `${manifest.name}: unresolved workspace dependency`);
  manifests.push(manifest);
  tarballs.push(tarball);
}

const consumer = await mkdtemp(path.join(tmpdir(), 'art-consumer-'));
try {
  await writeFile(path.join(consumer, 'package.json'), JSON.stringify({ name: 'art-consumer', private: true, type: 'module' }));
  execFileSync('npm', ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', ...tarballs], { cwd: consumer, stdio: 'pipe' });
  const imports = manifests.flatMap(manifest => Object.keys(manifest.exports).map(subpath =>
    `await import('${manifest.name}${subpath === '.' ? '' : subpath.slice(1)}');`)).join('\n');
  await writeFile(path.join(consumer, 'smoke.mjs'), imports);
  execFileSync(process.execPath, ['smoke.mjs'], { cwd: consumer, stdio: 'pipe' });
  await writeFile(path.join(consumer, 'consumer.ts'), `
import { ARichTextElement, enableStandardEditing } from '@arichtext/editor';
const editor = document.createElement('a-rich-text') as ARichTextElement;
editor.required = true;
editor.setText('Installed from tarballs');
const controller = enableStandardEditing(editor);
editor.setMark({type: 'link', href: 'https://example.com'});
controller.destroy();
`);
  execFileSync(path.join(root, 'node_modules/.bin/tsc'), ['--ignoreConfig', '--strict', '--noEmit', '--module', 'nodenext', '--target', 'es2022', 'consumer.ts'], { cwd: consumer, stdio: 'pipe' });
  console.log(`${tarballs.length} tarballs inspected; all exports imported without a DOM; isolated TypeScript consumer passed.`);
} finally {
  await rm(consumer, { recursive: true, force: true });
}
