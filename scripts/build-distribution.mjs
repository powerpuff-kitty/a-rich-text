import { build } from 'esbuild';
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';

await mkdir('dist/browser', { recursive: true });
await build({
  entryPoints: ['packages/editor/dist/index.js'], outfile: 'dist/browser/a-rich-text.js',
  bundle: true, minify: true, sourcemap: true, format: 'esm', platform: 'browser', target: 'es2022',
});
await copyFile('LICENSE', 'dist/browser/LICENSE');
await copyFile('packages/ui/THIRD_PARTY_NOTICES.txt', 'dist/browser/THIRD_PARTY_NOTICES.txt');
const fixture = await readFile('tests/browser/index.html', 'utf8');
await writeFile('dist/browser/index.html', fixture
  .replace('A Rich Text browser fixture', 'A Rich Text — standalone editor')
  .replace('<script type="module" src="/tests/browser/app.ts"></script>', `<script type="module">
import { enableStandardEditing } from './a-rich-text.js';
enableStandardEditing(document.querySelector('#editor'));
document.querySelector('form').addEventListener('submit', event => {
  event.preventDefault();
  document.querySelector('#submitted').value = new FormData(event.target).get('body');
});
</script>`));
console.log('Standalone ESM bundle and working form: dist/browser/index.html');

await import('./build-examples.mjs');
