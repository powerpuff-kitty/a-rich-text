import { build } from 'esbuild';
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';

await mkdir('dist/browser', { recursive: true });
await build({
  entryPoints: ['packages/editor/dist/index.js'], outfile: 'dist/browser/a-rich-text.js',
  bundle: true, minify: true, sourcemap: true, format: 'esm', platform: 'browser', target: 'es2022',
});
await copyFile('LICENSE', 'dist/browser/LICENSE');
await copyFile('packages/ui/THIRD_PARTY_NOTICES.txt', 'dist/browser/THIRD_PARTY_NOTICES.txt');
await copyFile('examples/showcase/index.html', 'dist/browser/index.html');
await copyFile('examples/showcase/app.js', 'dist/browser/showcase.js');
await copyFile('examples/format-profiles/index.html', 'dist/browser/format-profiles.html');
await copyFile('examples/quill-delta/index.html', 'dist/browser/quill-delta.html');
await build({ entryPoints: ['packages/quill-delta/dist/index.js'], outfile: 'dist/browser/quill-delta.js', bundle: true, minify: true, format: 'esm', platform: 'browser', target: 'es2022' });
await build({ entryPoints: ['packages/editor/dist/highlight.js'], outfile: 'dist/browser/highlight.js', bundle: true, minify: true, format: 'esm', platform: 'browser', target: 'es2022' });
await build({ entryPoints: ['packages/editor/dist/format.js'], outdir: 'dist/browser', chunkNames: 'formatter/[name]-[hash]', splitting: true, bundle: true, minify: true, format: 'esm', platform: 'browser', target: 'es2022' });
await copyFile('docs/editor-formats.md', 'dist/browser/editor-formats.md');
await copyFile('packages/editor/node_modules/prettier/LICENSE', 'dist/browser/PRETTIER-LICENSE');
await copyFile('packages/editor/node_modules/prettier/THIRD-PARTY-NOTICES.md', 'dist/browser/PRETTIER-THIRD-PARTY-NOTICES.md');
console.log('Standalone ESM bundle and showcase: dist/browser/index.html');

await import('./build-examples.mjs');

await mkdir('dist/browser/local-first', { recursive: true });
await copyFile('examples/local-first/index.html', 'dist/browser/local-first/index.html');
await copyFile('examples/local-first/sw.js', 'dist/browser/local-first/sw.js');
await build({ entryPoints: ['examples/local-first/app.js'], external: ['../a-rich-text.js'], outfile: 'dist/browser/local-first/app.js', bundle: true, minify: true, format: 'esm', platform: 'browser', target: 'es2022' });

await mkdir('dist/browser/inline-extensions', { recursive: true });
await copyFile('examples/inline-extensions/index.html', 'dist/browser/inline-extensions/index.html');
await build({ entryPoints: ['examples/inline-extensions/app.js'], external: ['../a-rich-text.js'], outfile: 'dist/browser/inline-extensions/app.js', bundle: true, minify: true, format: 'esm', platform: 'browser', target: 'es2022' });
