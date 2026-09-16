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
  if (['@arichtext/ui', '@arichtext/web-component'].includes(manifest.name)) assert(entries.includes('package/THIRD_PARTY_NOTICES.txt'), 'UI icons require their Font Awesome notice');
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
  // Supply the optional formatter from the locked local installation: this smoke
  // check must not depend on npm's separate registry cache or network access.
  const prettierPack = JSON.parse(execFileSync('npm', ['pack', path.join(root, 'packages/editor/node_modules/prettier'), '--offline', '--ignore-scripts', '--json', '--pack-destination', consumer], { cwd: consumer, encoding: 'utf8' }));
  const formatterPackage = Object.values(prettierPack)[0];
  assert(formatterPackage?.filename, 'npm pack did not produce the local formatter tarball');
  const formatterTarball = path.join(consumer, formatterPackage.filename);
  execFileSync('npm', ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', formatterTarball, ...tarballs], { cwd: consumer, stdio: 'pipe' });
  const imports = manifests.flatMap(manifest => Object.entries(manifest.exports).map(([subpath, entry]) =>
    `await import('${manifest.name}${subpath === '.' ? '' : subpath.slice(1)}'${entry.import?.endsWith('.json') ? ", { with: { type: 'json' } }" : ''});`)).join('\n');
  await writeFile(path.join(consumer, 'smoke.mjs'), imports + `\nconst schema = (await import('@arichtext/core/schema/art-v1.schema.json', { with: { type: 'json' } })).default;\nif (schema.properties.version.const !== 1) throw new Error('Installed ART schema missing');\nconst {createARTMigrationRegistry} = await import('@arichtext/core/migrations');\nif (!createARTMigrationRegistry().migrate(JSON.stringify({type:'doc',version:1,content:[]})).ok) throw new Error('Installed migration API failed');\nconst {formatSource} = await import('@arichtext/editor/format');\nconst result = await formatSource('{"ok":true}', 'json');\nif (!JSON.parse(result).ok) throw new Error('Installed formatter failed');\n`);
  execFileSync(process.execPath, ['smoke.mjs'], { cwd: consumer, stdio: 'pipe' });
  await writeFile(path.join(consumer, 'consumer.ts'), `
import { createARTMigrationRegistry } from '@arichtext/core/migrations';
const migration = createARTMigrationRegistry().migrate('{\"type\":\"doc\",\"version\":1,\"content\":[]}');
if (migration.ok) migration.document.content;
import { FormatProfileRegistry, artJSONProfile } from '@arichtext/core/profiles';
const registry = new FormatProfileRegistry();
registry.register(artJSONProfile);
registry.list();
import { formatSource } from '@arichtext/editor/format';
import { ARichTextElement, enableStandardEditing, detectInputFormat } from '@arichtext/editor';
const editor = document.createElement('a-rich-text') as ARichTextElement;
editor.required = true;
editor.sourceUpdate = 'auto';
editor.sourceFormatter = formatSource;
void editor.formatSource();
detectInputFormat('{\"ops\":[]}');
editor.views = ['visual', 'html', 'markdown', 'json'];
editor.tools = ['bold', 'link'];
editor.view = 'json';
editor.discardSource();
editor.setText('Installed from tarballs');
const shortEditor = document.createElement('art-editor');
shortEditor.sourceUpdate = 'auto';
const shortToolbar = document.createElement('art-toolbar');
shortToolbar.editor = shortEditor;
const shortSelect = document.createElement('art-select');
shortSelect.value = 'html';
const controller = enableStandardEditing(editor);
editor.setMark({type: 'link', href: 'https://example.com'});
controller.destroy();
`);
  execFileSync(path.join(root, 'node_modules/.bin/tsc'), ['--ignoreConfig', '--strict', '--noEmit', '--module', 'nodenext', '--target', 'es2022', 'consumer.ts'], { cwd: consumer, stdio: 'pipe' });
  console.log(`${tarballs.length} tarballs inspected; all exports imported without a DOM; isolated TypeScript consumer passed.`);
} finally {
  await rm(consumer, { recursive: true, force: true });
}
