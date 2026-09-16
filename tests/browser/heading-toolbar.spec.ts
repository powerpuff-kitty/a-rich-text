import { expect, test } from '@playwright/test';
import type { ARichTextElement } from '../../packages/web-component/src/index.js';

test('heading selector reflects imported levels and applies H4–H6 with undo', async ({ page }) => {
  await page.goto('/dist/browser/');
  const editor = page.locator('#editor');
  const style = page.getByRole('combobox', { name: 'Text style' });
  for (const level of [4, 5, 6]) {
    await editor.evaluate((node, level) => {
      const rich = node as ARichTextElement;
      rich.setHTML(`<h${level}>Heading</h${level}>`);
    }, level);
    await editor.locator(`[part="editor"] h${level}`).click();
    await expect(style).toHaveValue(`h${level}`);
    await style.selectOption('paragraph');
    expect(await editor.evaluate(node => (node as ARichTextElement).getHTML())).toBe('<p>Heading</p>');
    await style.selectOption(`h${level}`);
    expect(await editor.evaluate(node => (node as ARichTextElement).getHTML())).toBe(`<h${level}>Heading</h${level}>`);
    await editor.evaluate(node => (node as ARichTextElement).undo());
    await expect(style).toHaveValue('paragraph');
  }
});
