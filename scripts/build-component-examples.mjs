import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import { componentExamples } from '../examples/components/catalog.mjs';

const root = 'dist/browser/components';
await mkdir(root, { recursive: true });
await copyFile('examples/components/setup.js', `${root}/setup.js`);
const style = 'body { margin:40px auto; max-width:1080px; padding:0 20px; font:16px/1.5 system-ui,sans-serif; color:#172033; } header { margin-bottom:24px; } #component { padding:4px; }';
for (const [name, title] of componentExamples) {
  const tags = name === 'short-tags' ? ['art-shell', 'art-toolbar', 'art-editor'] : ['a-rich-text-shell', 'a-rich-text-toolbar', 'a-rich-text'];
  await writeFile(`${root}/${name}.html`, `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — A Rich Text</title><style>${style}</style>
<body data-example="${name}"><header><a href="./">All component examples</a><h1>${title}</h1><p>Live component example. Edit content and try the controls.</p></header>
<section id="component" aria-label="${title} example"><${tags[0]}><${tags[1]} for="editor"></${tags[1]}><${tags[2]} id="editor" aria-label="Document" views="visual html markdown json text" placeholder="Write something…"></${tags[2]}></${tags[0]}></section>
<script type="module" src="./setup.js"></script></body></html>`);
}
const examples = [...componentExamples.map(([name, title]) => ({ name, title, url: `./${name}.html` })),
  { name: 'custom-toolbar', title: 'Custom HTML/CSS toolbar', url: '../custom-toolbar.html' },
  { name: 'vue', title: 'Vue and Tailwind', url: '../vue.html' }];
const links = examples.map(({ name, title }) => `<li><a href="#${name}">${title}</a></li>`).join('');
const sections = examples.map(({ name, title, url }) => `<section id="${name}" aria-labelledby="${name}-title"><h2 id="${name}-title">${title}</h2><p><a href="${url}">Open standalone example</a></p><iframe src="${url}" title="${title} live example" loading="lazy"></iframe></section>`).join('');
await writeFile(`${root}/index.html`, `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Component examples — A Rich Text</title><style>${style}
body { max-width:1440px; } .gallery { display:grid; grid-template-columns:230px minmax(0,1fr); gap:32px; }
nav { position:sticky; top:16px; align-self:start; max-height:calc(100dvh - 32px); overflow:auto; }
nav ul { list-style:none; padding:0; margin:0; } nav a { display:block; padding:6px 8px; color:inherit; text-decoration:none; border-radius:4px; } nav a:hover, nav a:focus-visible { background:#e8edf5; }
section { scroll-margin-top:24px; margin-bottom:48px; } section:target h2 { text-decoration:underline; text-underline-offset:6px; }
iframe { display:block; width:100%; height:620px; border:1px solid #d7dce4; border-radius:8px; background:white; box-sizing:border-box; }
@media(max-width:760px) { .gallery { grid-template-columns:1fr; } nav { position:static; max-height:none; } nav ul { columns:2; } body { padding:0 12px; } }
</style><main><h1>Component examples</h1><p>Explore every live example below. Use the navigation to jump to a component.</p><div class="gallery"><nav aria-label="Component examples"><ul>${links}</ul></nav><div>${sections}</div></div></main>
<script>document.querySelectorAll('iframe').forEach(frame => frame.addEventListener('load', () => { const doc = frame.contentDocument; if (!doc) return; const style = doc.createElement('style'); style.textContent = 'body { margin:16px auto!important; padding:0 12px!important; } body > header, main > h1 { display:none!important; }'; doc.head.append(style); }));</script></html>`);
console.log('Component examples: dist/browser/components/index.html');
