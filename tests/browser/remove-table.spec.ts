import { expect, test } from '@playwright/test';
import type { ARichTextElement } from '../../packages/web-component/src/index.js';

test('table removal is contextual, leaves a typing position, and undoes intact', async ({ page }) => {
  await page.goto('/dist/browser/');
  const editor = page.locator('#editor');
  const remove = page.getByRole('button', { name: 'Remove table', exact: true });
  await editor.evaluate(node => (node as ARichTextElement).setHTML('<p>Before</p><table><tr><td><p>Keep me</p></td></tr></table><p>After</p>'));
  await editor.locator('[part="editor"] > p').first().click();
  await expect(remove).toBeHidden();
  await editor.locator('td p').click();
  await expect(remove).toBeVisible();
  const before = await editor.evaluate(node => (node as ARichTextElement).getJSON());
  await remove.click();
  await expect(editor.locator('table')).toHaveCount(0);
  await expect(remove).toBeHidden();
  await page.keyboard.type('Replacement');
  expect(await editor.evaluate(node => (node as ARichTextElement).getHTML())).toBe('<p>Before</p><p>Replacement</p><p>After</p>');
  // Undo typing first, then the one structural removal step.
  await editor.evaluate(node => {
    const rich = node as ARichTextElement;
    while (rich.canUndo && !rich.getHTML().includes('<table')) rich.undo();
  });
  expect(await editor.evaluate(node => (node as ARichTextElement).getJSON())).toEqual(before);
});

test('merged tables can be removed while developer configuration and locks are honored', async ({ page }) => {
  await page.goto('/dist/browser/');
  const editor = page.locator('#editor');
  const remove = page.getByRole('button', { name: 'Remove table', exact: true });
  await editor.evaluate(node => (node as ARichTextElement).setHTML('<table><tr><td colspan="2"><p>Wide</p></td></tr><tr><td><p>A</p></td><td><p>B</p></td></tr></table>'));
  await editor.locator('td p').first().click();
  await expect(remove).toBeVisible();
  await editor.evaluate(node => node.setAttribute('tools', 'bold'));
  await expect(remove).toBeHidden();
  await editor.evaluate(node => { node.setAttribute('tools', 'remove-table'); node.setAttribute('readonly', ''); });
  await expect(remove).toBeHidden();
  await editor.evaluate(node => node.removeAttribute('readonly'));
  await editor.locator('td p').first().click();
  await remove.click();
  await expect(editor.locator('table')).toHaveCount(0);
  await editor.evaluate(node => (node as ARichTextElement).undo());
  await expect(editor.locator('td[colspan="2"]')).toHaveText('Wide');
});
