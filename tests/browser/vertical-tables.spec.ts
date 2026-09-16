import { expect, test } from '@playwright/test';
import type { ARichTextElement } from '../../packages/web-component/src/index.js';

test('vertical spans round-trip and Tab skips fully covered rows without adding history', async ({ page }) => {
  await page.goto('/dist/browser/');
  const editor = page.locator('#editor');
  await editor.evaluate(node => (node as ARichTextElement).setHTML('<table><tr><td rowspan="2" colspan="2"><p>Shared</p></td></tr><tr></tr><tr><td><p>A</p></td><td><p>B</p></td></tr></table>'));
  await expect(editor.locator('td[rowspan="2"][colspan="2"]')).toHaveText('Shared');
  const before = await editor.evaluate(node => (node as ARichTextElement).getJSON());
  await editor.locator('td p').first().click();
  await page.keyboard.press('Tab');
  expect(await editor.evaluate(node => (node as ARichTextElement).getSelection()?.anchor.blockPath)).toEqual([0, 2, 0, 0]);
  await page.keyboard.press('Shift+Tab');
  expect(await editor.evaluate(node => (node as ARichTextElement).getSelection()?.anchor.blockPath)).toEqual([0, 0, 0, 0]);
  expect(await editor.evaluate(node => (node as ARichTextElement).canUndo)).toBe(false);
  for (const name of ['Merge with right cell', 'Split cell', 'Add table row', 'Add table column']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeHidden();
  }
  await editor.evaluate(node => { const rich = node as ARichTextElement; rich.setHTML(rich.getHTML()); });
  expect(await editor.evaluate(node => (node as ARichTextElement).getJSON())).toEqual(before);
  await editor.locator('td p').first().click();
  await page.getByRole('button', { name: 'Remove table', exact: true }).click();
  await expect(editor.locator('table')).toHaveCount(0);
  await editor.evaluate(node => (node as ARichTextElement).undo());
  expect(await editor.evaluate(node => (node as ARichTextElement).getJSON())).toEqual(before);
});
