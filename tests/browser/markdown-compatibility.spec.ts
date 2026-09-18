import { expect, test } from '@playwright/test';
import type { ARichTextElement } from '../../packages/web-component/src/index.js';

test('Markdown thematic breaks separate lists and survive source/visual switching', async ({ page }) => {
  await page.goto('/dist/browser/');
  await page.locator('#editor').evaluate(node => {
    const editor = node as ARichTextElement;
    editor.setText('Original'); editor.view = 'markdown';
  });
  const source = page.locator('#editor [part="source"]');
  await source.fill('* First\n*\t*\t*\n* Second\n* * * *');
  await expect.poll(() => page.locator('#editor').evaluate(node => (node as ARichTextElement).sourceDirty)).toBe(false);
  const document = await page.locator('#editor').evaluate(node => (node as ARichTextElement).getJSON());
  expect(document.content.map(block => block.type)).toEqual(['list', 'horizontalRule', 'list', 'horizontalRule']);
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'visual'; });
  await expect(page.locator('#editor [contenteditable] > ul')).toHaveCount(2);
  await expect(page.locator('#editor [contenteditable] > hr')).toHaveCount(2);
  await expect(page.locator('#editor [contenteditable] li')).toHaveCount(2);
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'markdown'; });
  await expect(source).toHaveValue('- First\n\n---\n\n- Second\n\n---');
  await page.locator('#editor').evaluate(node => {
    const editor = node as ARichTextElement;
    editor.setMarkdown(editor.getMarkdown());
  });
  expect(await page.locator('#editor').evaluate(node => (node as ARichTextElement).getJSON())).toEqual(document);
});

test('Markdown export preserves a rule inside a list item', async ({ page }) => {
  await page.goto('/dist/browser/');
  await page.locator('#editor').evaluate(node => {
    const editor = node as ARichTextElement;
    editor.setMarkdown('- First\n- * * *'); editor.view = 'markdown';
  });
  const source = page.locator('#editor [part="source"]');
  await expect(source).toHaveValue('- First\n- ***');
  await source.fill('- Updated\n- ***');
  await expect.poll(() => page.locator('#editor').evaluate(node => (node as ARichTextElement).sourceDirty)).toBe(false);
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'visual'; });
  await expect(page.locator('#editor [contenteditable] > ul')).toHaveCount(1);
  await expect(page.locator('#editor [contenteditable] li')).toHaveCount(2);
  await expect(page.locator('#editor [contenteditable] li hr')).toHaveCount(1);
  await expect(page.locator('#editor [contenteditable] > hr')).toHaveCount(0);
});

test('Markdown source preserves code padding and delimiter runs through visual editing', async ({ page }) => {
  await page.goto('/dist/browser/');
  await page.locator('#editor').evaluate(node => {
    const editor = node as ARichTextElement;
    editor.setText('Original'); editor.view = 'markdown';
  });
  const source = page.locator('#editor [part="source"]');
  await source.fill('``  `sample`  ``');
  await expect.poll(() => page.locator('#editor').evaluate(node => (node as ARichTextElement).sourceDirty)).toBe(false);
  expect(await page.locator('#editor').evaluate(node => (node as ARichTextElement).getJSON())).toMatchObject({ content: [{ type: 'paragraph', content: [{ text: ' `sample` ', marks: [{ type: 'code' }] }] }] });
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'visual'; });
  await expect(page.locator('#editor [contenteditable] code')).toHaveText(' `sample` ');
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'markdown'; });
  await expect(source).toHaveValue('``  `sample`  ``');
});

test('Markdown code takes precedence over apparent link markup', async ({ page }) => {
  await page.goto('/dist/browser/');
  await page.locator('#editor').evaluate(node => {
    const editor = node as ARichTextElement;
    editor.setMarkdown('[label `inside](/target`)'); editor.view = 'visual';
  });
  await expect(page.locator('#editor [contenteditable] a')).toHaveCount(0);
  await expect(page.locator('#editor [contenteditable] code')).toHaveText('inside](/target');
});

test('Markdown source preserves literal heading hashes and empty headings', async ({ page }) => {
  await page.goto('/dist/browser/');
  await page.locator('#editor').evaluate(node => {
    const editor = node as ARichTextElement;
    editor.setText('Original'); editor.view = 'markdown';
  });
  const source = page.locator('#editor [part="source"]');
  await source.fill('# foo#\n##\n### bar ###');
  await expect.poll(() => page.locator('#editor').evaluate(node => (node as ARichTextElement).sourceDirty)).toBe(false);
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'visual'; });
  await expect(page.locator('#editor [contenteditable] h1')).toHaveText('foo#');
  await expect(page.locator('#editor [contenteditable] h2')).toHaveText('');
  await expect(page.locator('#editor [contenteditable] h3')).toHaveText('bar');
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'markdown'; });
  await expect(source).toHaveValue('# foo\\#\n\n## \n\n### bar');
});

test('indented Markdown code preserves literal markup and whitespace through source views', async ({ page }) => {
  await page.goto('/dist/browser/');
  await page.locator('#editor').evaluate(node => {
    const editor = node as ARichTextElement;
    editor.setText('Original'); editor.view = 'markdown';
  });
  const source = page.locator('#editor [part="source"]');
  await source.fill('    # literal\n      next  \n\n    *last*');
  await expect.poll(() => page.locator('#editor').evaluate(node => (node as ARichTextElement).sourceDirty)).toBe(false);
  expect(await page.locator('#editor').evaluate(node => (node as ARichTextElement).getJSON())).toMatchObject({ content: [{ type: 'codeBlock', text: '# literal\n  next  \n\n*last*' }] });
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'visual'; });
  await expect(page.locator('#editor [contenteditable] pre code')).toHaveText('# literal\n  next  \n\n*last*');
  await expect(page.locator('#editor [contenteditable] h1')).toHaveCount(0);
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'markdown'; });
  await expect(source).toHaveValue('```\n# literal\n  next  \n\n*last*\n```');
});

test('setext headings update automatically and export as canonical ATX headings', async ({ page }) => {
  await page.goto('/dist/browser/');
  await page.locator('#editor').evaluate(node => {
    const editor = node as ARichTextElement;
    editor.setText('Original'); editor.view = 'markdown';
  });
  const source = page.locator('#editor [part="source"]');
  await source.fill('Main *title*\n===\n\nSecond\nline\n---');
  await expect.poll(() => page.locator('#editor').evaluate(node => (node as ARichTextElement).sourceDirty)).toBe(false);
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'visual'; });
  await expect(page.locator('#editor [contenteditable] h1')).toHaveText('Main title');
  await expect(page.locator('#editor [contenteditable] h1 em')).toHaveText('title');
  await expect(page.locator('#editor [contenteditable] h2')).toHaveText('Second line');
  await expect(page.locator('#editor [contenteditable] hr')).toHaveCount(0);
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'markdown'; });
  await expect(source).toHaveValue('# Main *title*\n\n## Second line');
});

test('indented fenced code normalizes language metadata without changing literal content', async ({ page }) => {
  await page.goto('/dist/browser/');
  await page.locator('#editor').evaluate(node => {
    const editor = node as ARichTextElement;
    editor.setText('Original'); editor.view = 'markdown';
  });
  const source = page.locator('#editor [part="source"]');
  // Deliberately unclosed, as it would be while typing. The terminal newline
  // terminates the last content line; it must not add another empty code line.
  await source.fill('  ~~~js startline=3\n    const x = 1;\n  <b>literal</b>\n');
  await expect.poll(() => page.locator('#editor').evaluate(node => (node as ARichTextElement).sourceDirty)).toBe(false);
  expect(await page.locator('#editor').evaluate(node => (node as ARichTextElement).getJSON())).toMatchObject({ content: [{ type: 'codeBlock', language: 'js', text: '  const x = 1;\n<b>literal</b>' }] });
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'visual'; });
  await expect(page.locator('#editor [contenteditable] pre code')).toHaveText('  const x = 1;\n<b>literal</b>');
  await expect(page.locator('#editor [contenteditable] pre b')).toHaveCount(0);
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'markdown'; });
  await expect(source).toHaveValue('```js\n  const x = 1;\n<b>literal</b>\n```');
});

test('Markdown hard breaks and literal backslashes survive visual/source switching', async ({ page }) => {
  await page.goto('/dist/browser/');
  await page.locator('#editor').evaluate(node => {
    const editor = node as ARichTextElement;
    editor.setText('Original'); editor.view = 'markdown';
  });
  const source = page.locator('#editor [part="source"]');
  await source.fill('C:\\Users\\name\\\nnext line');
  await expect.poll(() => page.locator('#editor').evaluate(node => (node as ARichTextElement).sourceDirty)).toBe(false);
  expect(await page.locator('#editor').evaluate(node => (node as ARichTextElement).getJSON())).toMatchObject({ content: [{ type: 'paragraph', content: [{ text: 'C:\\Users\\name\nnext line' }] }] });
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'visual'; });
  await expect(page.locator('#editor [contenteditable] p br')).toHaveCount(1);
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'markdown'; });
  await expect(source).toHaveValue('C:\\\\Users\\\\name  \nnext line');
  await source.fill('C:\\\\Users\\\\name  \nupdated line');
  await expect.poll(() => page.locator('#editor').evaluate(node => (node as ARichTextElement).sourceDirty)).toBe(false);
  expect(await page.locator('#editor').evaluate(node => (node as ARichTextElement).getJSON())).toMatchObject({ content: [{ type: 'paragraph', content: [{ text: 'C:\\Users\\name\nupdated line' }] }] });
});
