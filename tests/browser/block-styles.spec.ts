import { expect, test } from '@playwright/test';
import type { ARichTextElement } from '../../packages/web-component/src/index.js';

test('multi-block styles preserve the selection and undo together', async ({ page }) => {
  await page.goto('/dist/browser/');
  const editor = page.locator('#editor');
  const style = page.getByRole('combobox', { name: 'Text style' });
  await editor.evaluate(node => {
    const rich = node as ARichTextElement;
    rich.setHTML('<p><strong>First</strong></p><h2>Second</h2><p>Third</p>');
    rich.dispatch({ operations: [], selection: { anchor: { blockPath: [0], offset: 1 }, head: { blockPath: [2], offset: 2 } } });
  });
  await expect(style).toHaveValue('mixed');
  await style.selectOption('h5');
  await expect(style).toHaveValue('h5');
  expect(await editor.evaluate(node => (node as ARichTextElement).getHTML())).toBe('<h5><strong>First</strong></h5><h5>Second</h5><h5>Third</h5>');
  await editor.evaluate(node => (node as ARichTextElement).undo());
  await expect(style).toHaveValue('mixed');
  expect(await editor.evaluate(node => (node as ARichTextElement).getHTML())).toBe('<p><strong>First</strong></p><h2>Second</h2><p>Third</p>');
  await style.selectOption('paragraph');
  expect(await editor.evaluate(node => (node as ARichTextElement).getHTML())).toBe('<p><strong>First</strong></p><p>Second</p><p>Third</p>');
});

test('backward boundary selections exclude the next block and honor tool configuration', async ({ page }) => {
  await page.goto('/dist/browser/');
  const editor = page.locator('#editor');
  const style = page.getByRole('combobox', { name: 'Text style' });
  await editor.evaluate(node => {
    const rich = node as ARichTextElement;
    rich.setHTML('<p>First</p><h2>Second</h2>');
    rich.dispatch({ operations: [], selection: { anchor: { blockPath: [1], offset: 0 }, head: { blockPath: [0], offset: 1 } } });
  });
  await expect(style).toHaveValue('paragraph');
  await style.selectOption('h6');
  expect(await editor.evaluate(node => (node as ARichTextElement).getHTML())).toBe('<h6>First</h6><h2>Second</h2>');
  await editor.evaluate(node => node.setAttribute('tools', 'paragraph'));
  await expect(style.locator('option[value="h6"]')).toBeDisabled();
  await editor.evaluate(node => node.setAttribute('readonly', ''));
  await expect(style).toBeHidden();
});
