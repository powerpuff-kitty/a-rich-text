import { expect, test } from '@playwright/test';
import type { ARichTextElement } from '../../packages/web-component/src/index.js';

test('typing a URL boundary creates an undoable link without linking subsequent text', async ({ page }) => {
  await page.goto('/dist/browser/');
  const editor = page.locator('#editor');
  const surface = editor.locator('[part="editor"]');
  await editor.evaluate(node => (node as ARichTextElement).setText(''));
  await surface.click();
  await page.keyboard.type('https://example.com');
  await page.keyboard.press('Space');
  await expect(surface.locator('a')).toHaveAttribute('href', 'https://example.com');
  await editor.evaluate(node => (node as ARichTextElement).undo());
  await expect(surface.locator('a')).toHaveCount(0);
  expect(await editor.evaluate(node => (node as ARichTextElement).getText())).toBe('https://example.com');
  await editor.evaluate(node => (node as ARichTextElement).redo());
  await page.keyboard.type('next');
  await expect(surface.locator('a')).toHaveText('https://example.com');
  expect(await editor.evaluate(node => (node as ARichTextElement).getText())).toBe('https://example.com next');
});

test('autolink attributes and link tool configuration can suppress detection', async ({ page }) => {
  await page.goto('/dist/browser/');
  const editor = page.locator('#editor');
  const surface = editor.locator('[part="editor"]');
  for (const attributes of [{ autolink: 'false', tools: 'link' }, { autolink: 'true', tools: 'bold' }]) {
    await editor.evaluate((node, attrs) => {
      (node as ARichTextElement).setText('');
      node.setAttribute('autolink', attrs.autolink);
      node.setAttribute('tools', attrs.tools);
    }, attributes);
    await surface.click();
    await page.keyboard.type('www.example.com ');
    await expect(surface.locator('a')).toHaveCount(0);
  }
  await editor.evaluate(node => { node.removeAttribute('autolink'); node.setAttribute('tools', 'link'); (node as ARichTextElement).setText(''); });
  await surface.click();
  await page.keyboard.type('person@example.com ');
  await expect(surface.locator('a')).toHaveAttribute('href', 'mailto:person@example.com');
});

test('nested marked URLs retain formatting while code and explicit links stay unchanged', async ({ page }) => {
  await page.goto('/dist/browser/');
  const editor = page.locator('#editor');
  const surface = editor.locator('[part="editor"]');
  await editor.evaluate(node => (node as ARichTextElement).setHTML('<blockquote><p><strong>www.example.com</strong></p></blockquote>'));
  await surface.locator('p').click();
  await surface.locator('p').evaluate(node => {
    const text = node.firstChild!.firstChild!;
    window.getSelection()!.setBaseAndExtent(text, text.textContent!.length, text, text.textContent!.length);
  });
  await page.keyboard.press('Space');
  await expect(surface.locator('a')).toHaveAttribute('href', 'https://www.example.com');
  expect(await editor.evaluate(node => (node as ARichTextElement).getHTML())).toContain('<strong>');
  for (const html of ['<p><code>www.example.com</code></p>', '<p><a href="/manual">www.example.com</a></p>']) {
    await editor.evaluate((node, html) => (node as ARichTextElement).setHTML(html), html);
    await surface.locator('p').click();
    await surface.locator('p').evaluate(node => {
    const text = node.firstChild!.firstChild!;
    window.getSelection()!.setBaseAndExtent(text, text.textContent!.length, text, text.textContent!.length);
  });
    await page.keyboard.press('Space');
    await expect(surface.locator('a[href="https://www.example.com"]')).toHaveCount(0);
  }
});
