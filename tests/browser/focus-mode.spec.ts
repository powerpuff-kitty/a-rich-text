import { expect, test } from '@playwright/test';
import type { ARichTextElement } from '../../packages/web-component/src/index.js';

test.beforeEach(async ({ page }) => { await page.goto('/dist/browser/'); });

test('focus mode keeps toolbar, editing, undo and native form association', async ({ page }) => {
  const editor = page.locator('#editor');
  const toolbar = page.locator('a-rich-text-toolbar');
  const originalParent = await toolbar.evaluate(node => node.parentElement!.tagName);
  const surface = editor.locator('[part="editor"]');
  await surface.click();
  await page.keyboard.type('Before');
  await page.getByRole('button', { name: 'Enter focus mode', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Editor focus mode', exact: true });
  await expect(dialog).toBeVisible();
  await expect(surface).toBeFocused();
  expect(await toolbar.evaluate(node => node.parentElement!.id)).toBe('editor');
  await page.getByRole('button', { name: 'Bold', exact: true }).click();
  await page.keyboard.type(' after');
  expect(await editor.evaluate(node => (node as ARichTextElement).getHTML())).toContain('<strong> after</strong>');
  expect(await page.locator('form#fixture-form').evaluate(form => new FormData(form as HTMLFormElement).get('body'))).toContain('Before');
  await editor.locator('[part="focus-exit-button"]').click();
  await expect(dialog).not.toBeVisible();
  expect(await toolbar.evaluate(node => node.parentElement!.tagName)).toBe(originalParent);
  await expect(surface).toBeFocused();
  expect(await editor.evaluate(node => (node as ARichTextElement).canUndo)).toBe(true);
  await editor.evaluate(node => (node as ARichTextElement).undo());
  expect(await editor.evaluate(node => (node as ARichTextElement).getText())).not.toBe('Before after');
  expect(await editor.evaluate(node => (node as ARichTextElement).closest('form')!.id)).toBe('fixture-form');
});

test('source drafts, readonly inspection and keyboard return survive focus mode', async ({ page }) => {
  const editor = page.locator('#editor');
  await page.getByRole('button', { name: 'HTML', exact: true }).click();
  const source = page.getByRole('textbox', { name: 'HTML document source' });
  await source.fill('<p>Pending draft</p>');
  const enter = page.getByRole('button', { name: 'Enter focus mode', exact: true });
  await enter.focus();
  await page.keyboard.press('Enter');
  await expect(source).toHaveValue('<p>Pending draft</p>');
  await page.keyboard.press('Escape');
  await expect(enter).toBeFocused();
  expect(await editor.evaluate(node => (node as ARichTextElement).sourceDirty)).toBe(true);
  await page.getByRole('button', { name: 'Apply changes', exact: true }).click();
  await editor.evaluate(node => node.setAttribute('readonly', ''));
  await enter.click();
  await expect(page.getByRole('dialog', { name: 'Editor focus mode', exact: true })).toBeVisible();
  await expect(source).toHaveAttribute('readonly');
  await page.keyboard.press('Escape');
  expect(await editor.evaluate(node => (node as ARichTextElement).getHTML())).toBe('<p>Pending draft</p>');
});

test('nested authoring dialogs dismiss before focus mode and toolbar drafts stay isolated', async ({ page }) => {
  const editor = page.locator('#editor');
  await editor.locator('[part="editor"]').click();
  await page.keyboard.type('Link text');
  await page.getByRole('button', { name: 'Enter focus mode', exact: true }).click();
  await page.getByRole('button', { name: 'Insert code block', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Code block', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Editor focus mode', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Insert image', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Image', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    (window as unknown as { inputs: number }).inputs = 0;
    document.querySelector('#editor')!.addEventListener('input', () => (window as unknown as { inputs: number }).inputs++);
  });
  await page.getByRole('button', { name: 'Link', exact: true }).click();
  await page.getByRole('textbox', { name: 'Link URL', exact: true }).fill('https://example.com');
  expect(await page.evaluate(() => (window as unknown as { inputs: number }).inputs)).toBe(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Editor focus mode', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Editor focus mode', exact: true })).not.toBeVisible();
});

test('tool configuration, disabling, reset and disconnect restore the layout', async ({ page }) => {
  const editor = page.locator('#editor');
  for (const action of ['tools', 'disabled', 'fieldset', 'reset', 'disconnect']) {
    await editor.evaluate((node, action) => {
      node.removeAttribute('tools'); node.removeAttribute('disabled');
      node.closest('fieldset')?.removeAttribute('disabled');
      if (action === 'fieldset') { const fieldset = document.createElement('fieldset'); node.before(fieldset); fieldset.append(node); }
      (node as ARichTextElement).toggleFocusMode(true);
    }, action);
    await expect(page.getByRole('dialog', { name: 'Editor focus mode', exact: true })).toBeVisible();
    await editor.evaluate((node, action) => {
      if (action === 'tools') node.setAttribute('tools', 'bold');
      else if (action === 'disabled') node.setAttribute('disabled', '');
      else if (action === 'fieldset') node.closest('fieldset')!.disabled = true;
      else if (action === 'reset') node.closest('form')!.reset();
      else { const parent = node.parentElement!; node.remove(); parent.append(node); }
    }, action);
    await expect(page.getByRole('dialog', { name: 'Editor focus mode', exact: true })).not.toBeVisible();
    expect(await editor.evaluate(node => (node as ARichTextElement).focusMode)).toBe(false);
    expect(await page.locator('a-rich-text-toolbar').evaluate(node => node.parentElement!.id)).not.toBe('editor');
  }
  await editor.evaluate(node => node.setAttribute('tools', 'bold'));
  await expect(page.getByRole('button', { name: 'Enter focus mode', exact: true })).toBeHidden();
  expect(await editor.evaluate(node => (node as ARichTextElement).toggleFocusMode(true))).toBe(false);
});

test('custom light-DOM buttons retain styles and modal keyboard containment', async ({ page }) => {
  await page.evaluate(() => {
    const editor = document.querySelector('#editor') as ARichTextElement;
    const toolbar = document.createElement('div');
    toolbar.id = 'custom-focus-toolbar';
    toolbar.innerHTML = '<button type="button" class="custom-button">Custom bold</button>';
    const style = document.createElement('style'); style.textContent = '.custom-button { color: rgb(12, 34, 56); }';
    document.head.append(style); editor.before(toolbar);
    toolbar.querySelector('button')!.addEventListener('click', () => editor.toggleMark('bold'));
    editor.registerFocusToolbar(toolbar);
    editor.toggleFocusMode(true);
  });
  const button = page.getByRole('button', { name: 'Custom bold', exact: true });
  await expect(button).toBeVisible();
  await expect(button).toHaveCSS('color', 'rgb(12, 34, 56)');
  await page.locator('#editor [part="focus-exit-button"]').focus();
  await page.keyboard.press('Shift+Tab');
  const backgroundSubmit = page.getByRole('button', { name: 'Submit', exact: true, includeHidden: true });
  await backgroundSubmit.evaluate(node => (node as HTMLElement).focus());
  await expect(backgroundSubmit).not.toBeFocused();
  await page.locator('#editor [part="focus-exit-button"]').focus();
  expect(await page.locator('#editor [part="focus-dialog"]').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.keyboard.press('Escape');
  expect(await page.locator('#custom-focus-toolbar').evaluate(node => node.parentElement!.id)).not.toBe('editor');
});
