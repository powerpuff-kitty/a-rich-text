import { expect, test } from '@playwright/test';
import type { ARichTextElement } from '../../packages/web-component/src/index.js';

test('rows can be inserted and removed around horizontal spans with Undo', async ({ page }) => {
  await page.goto('/dist/browser/');
  const editor = page.locator('#editor');
  await editor.evaluate(node => (node as ARichTextElement).setHTML('<table><tr><td colspan="2"><p>Wide</p></td></tr><tr><td><p>Left</p></td><td><p>Right</p></td></tr></table>'));
  const before = await editor.evaluate(node => (node as ARichTextElement).getJSON());
  await editor.locator('td p').first().click();
  await page.getByRole('button', { name: 'Add table row', exact: true }).click();
  await expect(editor.locator('tr')).toHaveCount(3);
  await expect(editor.locator('tr').nth(1).locator('td')).toHaveCount(2);
  await expect(editor.locator('td[colspan="2"]')).toHaveText('Wide');
  await page.getByRole('button', { name: 'Remove table row', exact: true }).click();
  expect(await editor.evaluate(node => (node as ARichTextElement).getJSON())).toEqual(before);
  await editor.evaluate(node => (node as ARichTextElement).undo());
  await expect(editor.locator('tr')).toHaveCount(3);
  await editor.evaluate(node => (node as ARichTextElement).undo());
  expect(await editor.evaluate(node => (node as ARichTextElement).getJSON())).toEqual(before);
  await editor.locator('td p').last().click();
  await page.getByRole('button', { name: 'Remove table row', exact: true }).click();
  expect(await editor.evaluate(node => (node as ARichTextElement).getSelection()?.anchor.blockPath)).toEqual([0, 0, 0, 0]);
  await expect(page.getByRole('button', { name: 'Remove table row', exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Add table column', exact: true })).toBeVisible();
  await editor.evaluate(node => node.setAttribute('tools', 'remove-table'));
  await expect(page.getByRole('button', { name: 'Add table row', exact: true })).toBeHidden();
});
