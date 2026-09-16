import { chooseStyle } from './controls.js';
import { expect, test } from '@playwright/test';
import type { ARichTextElement } from '../../packages/web-component/src/index.js';

test('heading selector reflects imported levels and applies H4–H6 with undo', async ({ page }) => {
  await page.goto('/dist/browser/');
  const editor = page.locator('#editor');
  const style = page.locator('a-rich-text-toolbar a-rich-text-select[data-role=block]');
  for (const level of [4, 5, 6]) {
    await editor.evaluate((node, level) => {
      const rich = node as ARichTextElement;
      rich.setHTML(`<h${level}>Heading</h${level}>`);
    }, level);
    await editor.locator(`[part="editor"] h${level}`).click();
    await expect(style).toHaveAttribute('value', `h${level}`);
    await chooseStyle(page, 'paragraph');
    expect(await editor.evaluate(node => (node as ARichTextElement).getHTML())).toBe('<p>Heading</p>');
    await chooseStyle(page, `h${level}`);
    expect(await editor.evaluate(node => (node as ARichTextElement).getHTML())).toBe(`<h${level}>Heading</h${level}>`);
    await editor.evaluate(node => (node as ARichTextElement).undo());
    await expect(style).toHaveAttribute('value', 'paragraph');
  }
});
