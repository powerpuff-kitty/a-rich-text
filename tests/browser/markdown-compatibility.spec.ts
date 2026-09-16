import { expect, test } from '@playwright/test';
import type { ARichTextElement } from '../../packages/web-component/src/index.js';

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
