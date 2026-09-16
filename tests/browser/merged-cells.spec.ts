import { expect, test } from '@playwright/test';
import type { ARichTextElement } from '../../packages/web-component/src/index.js';

test('horizontal merge/split retain content, export spans and support Undo and Tab', async ({ page }) => {
  await page.goto('/dist/browser/');
  const editor = page.locator('#editor');
  const merge = page.getByRole('button', { name: 'Merge with right cell', exact: true });
  const split = page.getByRole('button', { name: 'Split cell', exact: true });
  await editor.evaluate(node => (node as ARichTextElement).setHTML('<table><tr><td><p><strong>Left</strong></p></td><td><p>Right</p></td><td><p>Next</p></td></tr></table>'));
  const before = await editor.evaluate(node => (node as ARichTextElement).getJSON());
  await editor.locator('td p').first().click();
  await expect(split).toBeHidden();
  await merge.click();
  await expect(editor.locator('td')).toHaveCount(2);
  await expect(editor.locator('td[colspan="2"]')).toHaveText('LeftRight');
  expect(await editor.evaluate(node => (node as ARichTextElement).getHTML())).toContain('colspan="2"');
  await expect(split).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add table column', exact: true })).toBeVisible();
  await page.keyboard.press('Tab');
  expect(await editor.evaluate(node => (node as ARichTextElement).getSelection()?.anchor.blockPath)).toEqual([0, 0, 1, 0]);
  await expect(merge).toBeHidden();
  await page.keyboard.press('Shift+Tab');
  await split.click();
  await expect(editor.locator('td')).toHaveCount(3);
  await expect(editor.locator('td').first()).toHaveText('LeftRight');
  await expect(editor.locator('td').nth(1)).toBeEmpty();
  await editor.evaluate(node => (node as ARichTextElement).undo());
  await expect(editor.locator('td[colspan="2"]')).toHaveCount(1);
  await editor.evaluate(node => (node as ARichTextElement).undo());
  expect(await editor.evaluate(node => (node as ARichTextElement).getJSON())).toEqual(before);
});

test('cell controls respect tools, locks and unsupported vertical spans', async ({ page }) => {
  await page.goto('/dist/browser/');
  const editor = page.locator('#editor');
  const merge = page.getByRole('button', { name: 'Merge with right cell', exact: true });
  await editor.evaluate(node => (node as ARichTextElement).setHTML('<table><tr><td><p>A</p></td><td><p>B</p></td></tr></table>'));
  await editor.locator('td p').first().click();
  await expect(merge).toBeVisible();
  await editor.evaluate(node => node.setAttribute('tools', 'remove-table'));
  await expect(merge).toBeHidden();
  await editor.evaluate(node => { node.removeAttribute('tools'); node.setAttribute('readonly', ''); });
  await expect(merge).toBeHidden();
  await editor.evaluate(node => { node.removeAttribute('readonly'); (node as ARichTextElement).setHTML('<table><tr><td rowspan="2"><p>A</p></td><td><p>B</p></td></tr><tr><td><p>C</p></td><td><p>D</p></td></tr></table>'); });
  await editor.locator('td p').first().click();
  await expect(merge).toBeHidden();
  await expect(page.getByRole('button', { name: 'Split cell', exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Remove table', exact: true })).toBeVisible();
});
