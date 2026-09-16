import { chromium } from '@playwright/test';
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
const content = '<h2>A better place to write</h2><p>Write <strong>clearly</strong>, share ideas, and keep your content portable.</p><p>One document. <em>Your interface.</em> <a href="https://example.com/docs">Your workflow.</a></p><ul data-art-list="task"><li><input type="checkbox" checked><p>Choose your tools</p></li><li><input type="checkbox"><p>Make it your own</p></li></ul>';
async function open(html = content) {
  await page.setViewportSize({ width: 1180, height: 900 });
  await page.goto(base);
  await page.evaluate(async html => { await customElements.whenDefined('a-rich-text'); document.querySelector('#editor').setHTML(html); }, html);
  // Presentation belongs to the surrounding documentation fixture. Component
  // shadow styles and controls are unchanged.
  await page.addStyleTag({ content: 'body { margin: 40px auto; max-width: 1080px; padding: 0 20px; font: 16px/1.5 system-ui,sans-serif; color: #172033; } label { display:block; margin-bottom:8px; } #fixture-form > button { margin-top:12px; }' });
  await page.locator('#editor [part="editor"] p').first().click();
}
async function capture(name, locator = page.locator('main')) {
  await page.evaluate(() => document.fonts.ready);
  await locator.screenshot({ path: `${output}/${name}.png`, animations: 'disabled', caret: 'hide' });
  captures.push(name);
  console.log(`Captured ${name}`);
}
try {
  await open();
  await capture('standard-editor');
  await capture('toolbar', page.locator('a-rich-text-toolbar'));
  await page.locator('a-rich-text-toolbar').evaluate(node => node.remove());
  await capture('base-editor', page.locator('#editor'));

  await open('<h2>Release checklist</h2><p>Plan the next release together.</p><table><tr><th><p>Task</p></th><th><p>Owner</p></th><th><p>Status</p></th></tr><tr><td><p>Review the draft</p></td><td><p>Alex</p></td><td><p>Ready</p></td></tr><tr><td><p>Publish the guide</p></td><td><p>Sam</p></td><td><p>In progress</p></td></tr></table>');
  await page.locator('#editor td p').first().click();
  await capture('table-controls');

  await open();
  await page.getByRole('button', { name: 'Link', exact: true }).click();
  await page.getByRole('textbox', { name: 'Link URL' }).fill('https://example.com/guide');
  await capture('link-editor');

  for (const view of ['html', 'markdown', 'json', 'text']) {
    await open('<h2>Portable content</h2><p>Keep <strong>one document</strong> in the format your app needs.</p>');
    await page.locator('#editor').evaluate((node, view) => { node.view = view; }, view);
    const source = page.getByRole('textbox', { name: 'Document source' });
    await source.fill((await source.inputValue()) + '\n');
    await source.evaluate(node => { node.setSelectionRange(0, 0); node.scrollTop = 0; node.scrollLeft = 0; });
    await capture(`source-${view}`);
  }

  await open();
  await page.locator('#editor').evaluate(node => node.openFindReplace('your'));
  await page.getByRole('textbox', { name: 'Replace with', exact: true }).fill('our');
  await capture('find-replace');

  await open();
  await page.getByRole('button', { name: 'Insert code block', exact: true }).click();
  await page.getByLabel('Language (optional)').fill('typescript');
  await page.getByLabel('Code', { exact: true }).fill("const editor = document.querySelector('a-rich-text');\neditor.setHTML('<p>Hello, world!</p>');");
  await capture('code-editor', page.locator('[part="code-dialog"]'));

  await open();
  await page.getByRole('button', { name: 'Insert image', exact: true }).click();
  await page.getByLabel('Image URL', { exact: true }).fill('/images/team-workshop.jpg');
  await page.getByLabel('Alternative text', { exact: true }).fill('Team members reviewing a draft at a workshop');
  await page.getByLabel('Width (pixels)').fill('960');
  await page.getByLabel('Height (pixels)').fill('640');
  await capture('image-editor', page.locator('[part="image-dialog"]'));

  await open();
  await page.locator('#editor').evaluate(node => node.toggleFocusMode(true));
  await capture('focus-mode', page.locator('[part="focus-dialog"]'));

  await open();
  await page.setViewportSize({ width: 390, height: 844 });
  await capture('mobile-editor');

  for (const [route, id, name] of [['custom-toolbar.html', 'custom-editor', 'custom-toolbar'], ['vue.html', 'vue-editor', 'vue-tailwind']]) {
    await page.setViewportSize({ width: 1180, height: 900 });
    await page.goto(`${base}/${route}`);
    await page.locator(`#${id} [part="editor"]`).click();
    await capture(name);
  }
  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(`${output}/manifest.json`, JSON.stringify({ browser: `Chromium ${browser.version()}`, viewport: '1180×900; mobile 390×844', scale: 1, captures }, null, 2) + '\n');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
