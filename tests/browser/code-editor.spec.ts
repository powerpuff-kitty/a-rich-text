import { expect, test } from '@playwright/test';
import type { ARichTextElement } from '../../packages/web-component/src/index.js';

test.beforeEach(async ({ page }) => {
  await page.goto(process.env.ART_BROWSER_FIXTURE ?? '/dist/browser/');
});

test('creates and edits code blocks with draft isolation, format fidelity and undo', async ({ page }) => {
  const editor = page.locator('#editor');
  const surface = editor.locator('[part="editor"]');
  await surface.click();
  await page.getByRole('button', { name: 'Insert code block', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Code block' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: 'Code', exact: true })).toBeFocused();
  const code = 'if (a < b) {\n  console.log("``` & <script>");\n}';
  await dialog.getByRole('textbox', { name: 'Code', exact: true }).fill(code);
  await dialog.getByRole('textbox', { name: 'Language (optional)' }).fill('javascript');
  expect(await editor.evaluate(node => (node as ARichTextElement).getText())).toBe('');
  await dialog.getByRole('button', { name: 'Apply code', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(surface.locator('pre code')).toHaveText(code);
  const original = await editor.evaluate(node => (node as ARichTextElement).getJSON());
  const formats = await editor.evaluate(node => {
    const rich = node as ARichTextElement;
    return { html: rich.getHTML(), md: rich.getMarkdown() };
  });
  expect(formats.html).not.toContain('Edit code block');
  expect(formats.html).toContain('&lt;script&gt;');
  expect(formats.md).toContain('javascript');
  for (const format of ['html', 'md'] as const) {
    await editor.evaluate((node, data) => {
      const rich = node as ARichTextElement;
      if (data.format === 'html') rich.setHTML(data.value); else rich.setMarkdown(data.value);
    }, { format, value: formats[format] });
    expect(await editor.evaluate(node => (node as ARichTextElement).getJSON().content.find(block => block.type === 'codeBlock')))
      .toEqual(original.content.find(block => block.type === 'codeBlock'));
  }
  // Native DOM reconciliation must retain language and exclude editor-only controls.
  await surface.dispatchEvent('input');
  expect(await editor.evaluate(node => (node as ARichTextElement).getJSON().content.find(block => block.type === 'codeBlock')))
    .toEqual(original.content.find(block => block.type === 'codeBlock'));
  await page.getByRole('button', { name: 'Edit code block', exact: true }).focus();
  await page.keyboard.press('Enter');
  await dialog.getByRole('textbox', { name: 'Code', exact: true }).fill('updated');
  await dialog.getByRole('button', { name: 'Apply code', exact: true }).click();
  await expect(surface.locator('pre code')).toHaveText('updated');
  await editor.evaluate(node => (node as ARichTextElement).undo());
  await expect(surface.locator('pre code')).toHaveText(code);
  await page.getByRole('button', { name: 'Edit code block', exact: true }).click();
  await dialog.getByRole('button', { name: 'Remove code block', exact: true }).click();
  await expect(surface.locator('pre')).toHaveCount(0);
  await surface.pressSequentially('replacement');
  await expect(surface).toContainText('replacement');
});

test('code drafts cancel safely, reject stale writes and respect configuration', async ({ page }) => {
  const editor = page.locator('#editor');
  await editor.evaluate(node => (node as ARichTextElement).setHTML('<blockquote><pre><code class="language-js">original</code></pre></blockquote>'));
  const dialog = page.getByRole('dialog', { name: 'Code block' });
  await page.getByRole('button', { name: 'Edit code block', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Code', exact: true }).fill('cancelled');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit code block', exact: true })).toBeFocused();
  await expect(editor.locator('pre code')).toHaveText('original');
  await page.getByRole('button', { name: 'Edit code block', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Language (optional)' }).fill('invalid`');
  await dialog.getByRole('button', { name: 'Apply code', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('without spaces or backticks');
  await dialog.getByRole('textbox', { name: 'Language (optional)' }).fill('js');
  await dialog.getByRole('textbox', { name: 'Code', exact: true }).fill('draft');
  await editor.evaluate(node => (node as ARichTextElement).setText('external update'));
  await dialog.getByRole('button', { name: 'Apply code', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('document changed');
  expect(await editor.evaluate(node => (node as ARichTextElement).getText())).toBe('external update');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await editor.evaluate(node => (node as ARichTextElement).setHTML('<pre><code>safe</code></pre>'));
  await editor.evaluate(node => (node as ARichTextElement).setAttribute('tools', 'bold'));
  await expect(page.getByRole('button', { name: 'Edit code block', exact: true })).toHaveCount(0);
  expect(await editor.evaluate(node => (node as ARichTextElement).openCodeEditor([0]))).toBe(false);
  await editor.evaluate(node => { node.removeAttribute('tools'); node.setAttribute('readonly', ''); });
  expect(await editor.evaluate(node => (node as ARichTextElement).openCodeEditor([0]))).toBe(false);
  await expect(editor.locator('pre code')).toHaveText('safe');
});

test('locking, tool changes and form reset close code drafts without applying them', async ({ page }) => {
  const editor = page.locator('#editor');
  const dialog = page.getByRole('dialog', { name: 'Code block' });
  for (const attribute of ['readonly', 'disabled', 'tools']) {
    await editor.evaluate(node => {
      node.removeAttribute('readonly'); node.removeAttribute('disabled'); node.removeAttribute('tools');
      (node as ARichTextElement).setHTML('<pre><code>original</code></pre>');
    });
    await page.getByRole('button', { name: 'Edit code block', exact: true }).click();
    await dialog.getByRole('textbox', { name: 'Code', exact: true }).fill('unapplied');
    await editor.evaluate((node, attribute) => node.setAttribute(attribute, ''), attribute);
    await expect(dialog).not.toBeVisible();
    expect(await editor.evaluate(node => (node as ARichTextElement).getText())).toBe('original');
  }
  await editor.evaluate(node => { node.removeAttribute('tools'); });
  await page.getByRole('button', { name: 'Edit code block', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Code', exact: true }).fill('unapplied');
  await editor.evaluate(node => node.closest('form')!.reset());
  await expect(dialog).not.toBeVisible();
  expect(await editor.evaluate(node => (node as ARichTextElement).getText())).toBe('');
});

test('code edit icon stays at the top right and is revealed on hover, focus or touch', async ({ page }) => {
  const editor = page.locator('#editor');
  await editor.evaluate(node => (node as ARichTextElement).setHTML('<pre><code>const greeting = "hello";</code></pre>'));
  const block = editor.locator('pre');
  const button = block.getByRole('button', { name: 'Edit code block', exact: true });
  await expect(button.locator('svg')).toHaveCount(1);
  await expect(button).toHaveText('');
  if (await page.evaluate(() => matchMedia('(hover: hover)').matches)) {
    await page.mouse.move(0, 0); await expect(button).toHaveCSS('opacity', '0');
    await block.hover(); await expect(button).toHaveCSS('opacity', '1');
    await page.mouse.move(0, 0); await expect(button).toHaveCSS('opacity', '0');
  } else await expect(button).toHaveCSS('opacity', '1');
  await button.focus(); await expect(button).toHaveCSS('opacity', '1');
  const rects = await block.evaluate(node => {
    const block = node.getBoundingClientRect(), button = node.querySelector('button')!.getBoundingClientRect();
    return { top: button.top - block.top, right: block.right - button.right };
  });
  expect(rects.top).toBeGreaterThanOrEqual(0); expect(rects.top).toBeLessThan(12);
  expect(rects.right).toBeGreaterThanOrEqual(0); expect(rects.right).toBeLessThan(12);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Code block', exact: true })).toBeVisible();
  await page.keyboard.press('Escape'); await expect(button).toBeFocused();
});
