import { chromium } from '@playwright/test';
import { componentExamples } from '../examples/components/catalog.mjs';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const root = resolve('dist/browser');
const output = resolve('docs/screenshots');
await mkdir(output, { recursive: true });
const server = createServer(async (request, response) => {
  try {
    const path = resolve(root, `.${new URL(request.url, 'http://localhost').pathname.replace(/\/$/, '/index.html')}`);
    if (!path.startsWith(root + sep)) { response.writeHead(403).end(); return; }
    response.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[extname(path)] ?? 'application/octet-stream');
    response.end(await readFile(path));
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch().catch(error => { server.close(); throw error; });
const context = await browser.newContext({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 1, colorScheme: 'light', reducedMotion: 'reduce', locale: 'en-US' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const captures = [];
async function capture(name, locator = page.locator('#component')) {
  await page.evaluate(() => document.fonts.ready);
  await locator.screenshot({ path: `${output}/${name}.png`, animations: 'disabled', caret: 'hide' });
  captures.push(name);
  console.log(`Captured ${name}`);
}
try {
  for (const [name] of componentExamples) {
    await page.setViewportSize(name === 'mobile-editor' ? { width: 390, height: 844 } : { width: 1180, height: 900 });
    await page.goto(`${base}/components/${name}.html`);
    await page.locator('body[data-ready="true"]').waitFor();
    const target = ({ toolbar: 'a-rich-text-toolbar', 'base-editor': '#editor',
      'link-editor': '[part="link-editor"]', 'code-editor': '[part="code-dialog"]',
      'image-editor': '[part="image-dialog"]', 'focus-mode': '[part="focus-dialog"]' })[name];
    await capture(name, target ? page.locator(target) : page.locator('#component'));
  }

  for (const [route, id, name] of [['custom-toolbar.html', 'custom-editor', 'custom-toolbar'], ['vue.html', 'vue-editor', 'vue-tailwind']]) {
    await page.setViewportSize({ width: 1180, height: 900 });
    await page.goto(`${base}/${route}`);
    await page.locator(`#${id} [part="editor"]`).click();
    // Capture only the custom controls and editor; labels, headings, form
    // actions and bound-value output belong to the surrounding example.
    const controls = page.getByRole('group', { name: 'Custom formatting' });
    await controls.getByRole('button').first().waitFor();
    const boxes = await Promise.all([controls.boundingBox(), page.locator(`#${id}`).boundingBox()]);
    if (boxes.some(box => !box)) throw new Error(`Missing component bounds: ${name}`);
    const x = Math.min(...boxes.map(box => box.x)) - 4;
    const y = Math.min(...boxes.map(box => box.y)) - 4;
    const right = Math.max(...boxes.map(box => box.x + box.width)) + 4;
    const bottom = Math.max(...boxes.map(box => box.y + box.height)) + 4;
    await page.screenshot({ path: `${output}/${name}.png`, clip: { x: Math.max(0, x), y: Math.max(0, y), width: right - Math.max(0, x), height: bottom - Math.max(0, y) }, animations: 'disabled', caret: 'hide' });
    captures.push(name);
    console.log(`Captured ${name}`);
  }
  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(`${output}/manifest.json`, JSON.stringify({ browser: `Chromium ${browser.version()}`, viewport: '1180×900; mobile 390×844', scale: 1, captures }, null, 2) + '\n');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
