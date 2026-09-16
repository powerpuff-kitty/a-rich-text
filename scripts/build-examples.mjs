import { build } from 'esbuild';
import { dirname } from 'node:path';
import { parse, compileScript } from '@vue/compiler-sfc';
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

await copyFile('node_modules/vue/LICENSE', 'dist/browser/VUE_LICENSE');
await copyFile('node_modules/tailwindcss/LICENSE', 'dist/browser/TAILWIND_LICENSE');
await copyFile('examples/custom-toolbar/index.html', 'dist/browser/custom-toolbar.html');
await build({
  entryPoints: ['examples/vue/main.ts'], outfile: 'dist/browser/vue-example.js',
  bundle: true, minify: true, format: 'esm', platform: 'browser', target: 'es2022',
  define: { 'process.env.NODE_ENV': '"production"', __VUE_OPTIONS_API__: 'false', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' },
  plugins: [{ name: 'vue-example', setup(builder) {
    builder.onLoad({ filter: /\.vue$/ }, async args => {
      const { descriptor, errors } = parse(await readFile(args.path, 'utf8'), { filename: args.path });
      if (errors.length) throw errors[0];
      const script = compileScript(descriptor, {
        id: args.path, inlineTemplate: true,
        templateOptions: { compilerOptions: { isCustomElement: tag => tag === 'a-rich-text' || tag === 'a-rich-text-toolbar' } },
      });
      return { contents: script.content, loader: 'ts', resolveDir: dirname(args.path) };
    });
  } }],
});
execFileSync('pnpm', ['exec', 'tailwindcss', '-i', 'examples/vue/styles.css', '-o', 'dist/browser/vue-example.css', '--minify'], { stdio: 'inherit' });
await writeFile('dist/browser/vue.html', '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vue integration — A Rich Text</title><link rel="stylesheet" href="./vue-example.css"><div id="app"></div><script type="module" src="./vue-example.js"></script></html>');
console.log('Integration examples: dist/browser/custom-toolbar.html and dist/browser/vue.html');
await import('./build-component-examples.mjs');
