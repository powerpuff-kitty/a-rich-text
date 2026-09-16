import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import { componentExamples } from '../examples/components/catalog.mjs';

const root = 'dist/browser/components';
await mkdir(root, { recursive: true });
await copyFile('examples/components/setup.js', `${root}/setup.js`);
const style = 'body { margin:40px auto; max-width:1080px; padding:0 20px; font:16px/1.5 system-ui,sans-serif; color:#172033; } header { margin-bottom:24px; } #component { padding:4px; }';
for (const [name, title] of componentExamples) {
  await writeFile(`${root}/${name}.html`, `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — A Rich Text</title><style>${style}</style>
<body data-example="${name}"><header><a href="./">All component examples</a><h1>${title}</h1><p>Live component example. Edit content and try the controls.</p></header>
<section id="component" aria-label="${title} example"><a-rich-text-shell><a-rich-text-toolbar for="editor"></a-rich-text-toolbar><a-rich-text id="editor" aria-label="Document" views="visual html markdown json text" placeholder="Write something…"></a-rich-text></a-rich-text-shell></section>
<script type="module" src="./setup.js"></script></body></html>`);
}
const links = [...componentExamples.map(([name, title]) => `<li><a href="./${name}.html">${title}</a></li>`), '<li><a href="../custom-toolbar.html">Custom HTML/CSS toolbar</a></li>', '<li><a href="../vue.html">Vue and Tailwind</a></li>'];
await writeFile(`${root}/index.html`, `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Component examples — A Rich Text</title><style>${style}</style><main><h1>Component examples</h1><p>Choose a live example. Each surface is also shown in the documentation gallery.</p><ul>${links.join('')}</ul></main></html>`);
console.log('Component examples: dist/browser/components/index.html');
