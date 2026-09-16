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
  for (const name of ['Merge with right cell', 'Add table row', 'Add table column']) {
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

test('splits vertical and combined spans with Undo, navigation and tool/lock controls', async ({ page }) => {
  await page.goto('/dist/browser/');
  const editor = page.locator('#editor');
  await editor.evaluate(node => (node as ARichTextElement).setHTML('<table><tr><td rowspan="2" colspan="2"><p>Shared</p><p>More</p></td></tr><tr></tr></table>'));
  const before = await editor.evaluate(node => (node as ARichTextElement).getJSON());
  await editor.locator('td p').first().click();
  const split = page.getByRole('button', { name: 'Split cell', exact: true });
  await expect(split).toBeVisible();
  await editor.evaluate(node => node.setAttribute('tools', 'remove-table'));
  await expect(split).toBeHidden();
  await editor.evaluate(node => { node.removeAttribute('tools'); node.setAttribute('readonly', ''); });
  await expect(split).toBeHidden();
  await editor.evaluate(node => node.removeAttribute('readonly'));
  await split.click();
  await expect(editor.locator('td')).toHaveCount(4);
  await expect(editor.locator('td').first().locator('p')).toHaveText(['Shared', 'More']);
  await expect(editor.locator('td[rowspan], td[colspan]')).toHaveCount(0);
  await expect(split).toBeHidden();
  await expect(page.getByRole('button', { name: 'Add table row', exact: true })).toBeVisible();
  await page.keyboard.press('Tab');
  expect(await editor.evaluate(node => (node as ARichTextElement).getSelection()?.anchor.blockPath)).toEqual([0, 0, 1, 0]);
  await editor.evaluate(node => (node as ARichTextElement).undo());
  expect(await editor.evaluate(node => (node as ARichTextElement).getJSON())).toEqual(before);
});

test('merges matching cells below, preserves exports and supports split and Undo', async ({ page }) => {
  await page.goto('/dist/browser/');
  const editor = page.locator('#editor');
  await editor.evaluate(node => (node as ARichTextElement).setHTML('<table><tr><td colspan="2"><p>Top</p></td></tr><tr><td colspan="2"><p>Bottom</p></td></tr></table>'));
  const original = await editor.evaluate(node => (node as ARichTextElement).getJSON());
  await editor.locator('td p').first().click();
  const merge = page.getByRole('button', { name: 'Merge with cell below', exact: true });
  await expect(merge).toBeVisible();
  await editor.evaluate(node => node.setAttribute('tools', 'split-cell'));
  await expect(merge).toBeHidden();
  await editor.evaluate(node => { node.removeAttribute('tools'); node.setAttribute('readonly', ''); });
  await expect(merge).toBeHidden();
  await editor.evaluate(node => node.removeAttribute('readonly'));
  await merge.click();
  await expect(editor.locator('td[rowspan="2"][colspan="2"] p')).toHaveText(['Top', 'Bottom']);
  await expect(merge).toBeHidden();
  const merged = await editor.evaluate(node => (node as ARichTextElement).getJSON());
  await editor.evaluate(node => (node as ARichTextElement).undo());
  expect(await editor.evaluate(node => (node as ARichTextElement).getJSON())).toEqual(original);
  await editor.evaluate(node => (node as ARichTextElement).redo());
  expect(await editor.evaluate(node => (node as ARichTextElement).getJSON())).toEqual(merged);
  await editor.evaluate(node => { const e = node as ARichTextElement; e.setHTML(e.getHTML()); });
  expect(await editor.evaluate(node => (node as ARichTextElement).getJSON())).toEqual(merged);
  await editor.locator('td p').first().click();
  await page.getByRole('button', { name: 'Split cell', exact: true }).click();
  await expect(editor.locator('td')).toHaveCount(4);
});
