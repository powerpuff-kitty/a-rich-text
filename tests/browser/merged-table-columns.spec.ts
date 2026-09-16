import { expect, test } from '@playwright/test';
import type { ARichTextElement } from '../../packages/web-component/src/index.js';

test('column edits preserve spans and content with correct logical boundaries and Undo', async ({ page }) => {
  await page.goto('/dist/browser/');
  const editor = page.locator('#editor');
  await editor.evaluate(node => (node as ARichTextElement).setHTML('<table><tr><td><p>A</p></td><td><p>B</p></td><td><p>C</p></td></tr><tr><td colspan="3"><p>Wide</p></td></tr></table>'));
  const before = await editor.evaluate(node => (node as ARichTextElement).getJSON());
  await editor.locator('td p').nth(1).click();
  await page.getByRole('button', { name: 'Add table column', exact: true }).click();
  await expect(editor.locator('td[colspan="4"]')).toHaveText('Wide');
  await expect(editor.locator('tr').first().locator('td')).toHaveCount(4);
  await page.getByRole('button', { name: 'Remove table column', exact: true }).click();
  expect(await editor.evaluate(node => (node as ARichTextElement).getJSON())).toEqual(before);
  await editor.evaluate(node => (node as ARichTextElement).undo());
  await expect(editor.locator('td[colspan="4"]')).toHaveCount(1);
  await editor.evaluate(node => (node as ARichTextElement).undo());
  expect(await editor.evaluate(node => (node as ARichTextElement).getJSON())).toEqual(before);
  await editor.locator('td p').last().click();
  await page.getByRole('button', { name: 'Remove table column', exact: true }).click();
  await expect(editor.locator('td[colspan="2"]')).toHaveText('Wide');
  await expect(editor.locator('tr').first()).toHaveText('BC');
  await editor.evaluate(node => (node as ARichTextElement).undo());
  expect(await editor.evaluate(node => (node as ARichTextElement).getJSON())).toEqual(before);
});
