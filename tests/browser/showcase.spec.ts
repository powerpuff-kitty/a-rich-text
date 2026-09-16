import { expect, test } from '@playwright/test';
import type { ARichTextElement } from '../../packages/web-component/src/index.js';
import { chooseView } from './controls.js';

async function choose(page: import('@playwright/test').Page, name: string, option: string) {
  await page.getByRole('combobox', { name, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

test('showcase has a shared frame and distinct live presets without changing content', async ({ page }) => {
  await page.goto('/dist/browser/');
  await expect(page.getByText('Body', { exact: true })).toHaveCount(0);
  await choose(page, 'Sample document', 'Writing & tasks');
  const editor = page.locator('#editor');
  const original = await editor.evaluate((node: ARichTextElement) => node.getJSON());
  const shell = page.locator('a-rich-text-shell');
  await expect(editor.locator('[part=editor]')).toHaveCSS('border-top-width', '0px');
  await expect(shell).toHaveCSS('border-top-width', '1px');
  await choose(page, 'Appearance', 'Minimal · borderless');
  await expect(shell).toHaveCSS('border-top-width', '0px');
  await choose(page, 'Appearance', 'Document · paper');
  await expect(editor.locator('[part=editor]')).toHaveCSS('font-family', /Georgia/);
  expect(await editor.evaluate((node: ARichTextElement) => node.getJSON())).toEqual(original);
  const gap = await page.getByRole('button', { name: 'Submit', exact: true }).evaluate(node => node.getBoundingClientRect().top - document.querySelector('a-rich-text-shell')!.getBoundingClientRect().bottom);
  expect(gap).toBeGreaterThanOrEqual(24);
  await choose(page, 'Tool set', 'Basic writing');
  await editor.locator('[part=editor]').click();
  await expect(page.getByRole('button', { name: 'Italic', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Task list', exact: true })).toBeHidden();
  expect(await page.locator('#integration').textContent()).toContain('tools="paragraph heading bold italic link bullet-list ordered-list undo redo"');
});

test('dropdown flips at viewport edges and supports keyboard selection and escape', async ({ page }) => {
  await page.goto('/dist/browser/');
  await page.evaluate(() => {
    const select = document.querySelector('#appearance') as HTMLElement;
    select.style.cssText = 'position:fixed;right:2px;bottom:2px;z-index:5';
  });
  const trigger = page.getByRole('combobox', { name: 'Appearance', exact: true });
  await trigger.click();
  const menu = page.getByRole('listbox', { name: 'Appearance', exact: true });
  await expect(menu).toHaveAttribute('data-placement', 'above');
  const box = (await menu.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  await page.keyboard.press('End'); await page.keyboard.press('Enter');
  await expect(page.locator('#editor')).toHaveAttribute('preset', 'document');
  await trigger.press('ArrowDown'); await page.keyboard.press('Escape');
  await expect(menu).toBeHidden(); await expect(trigger).toBeFocused();
});

test('inline mode formats selections and retains format access without selection', async ({ page }) => {
  await page.goto('/dist/browser/');
  await choose(page, 'Toolbar mode', 'Inline · select text');
  const editor = page.locator('#editor');
  await editor.evaluate((node: ARichTextElement) => { node.setText('Select me'); node.focus(); node.dispatch({ operations: [], selection: { anchor: { blockPath: [0], offset: 0 }, head: { blockPath: [0], offset: 9 } } }); });
  const popup = (await page.getByRole('toolbar', { name: 'Text formatting' }).boundingBox())!;
  const text = (await editor.locator('[part=editor] p').boundingBox())!;
  expect(Math.abs(popup.y + popup.height - text.y)).toBeLessThan(180);
  await page.getByRole('button', { name: 'Bold', exact: true }).click();
  expect(await editor.evaluate((node: ARichTextElement) => node.getHTML())).toBe('<p><strong>Select me</strong></p>');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('toolbar', { name: 'Text formatting' })).toBeHidden();
  await chooseView(page, 'HTML');
  await expect(page.getByRole('textbox', { name: 'HTML document source' })).toHaveValue('<p><strong>Select me</strong></p>');
  await chooseView(page, 'Editor');
  await editor.locator('[part=editor]').click();
  await page.keyboard.press('Alt+F10');
  await editor.evaluate(node => node.dispatchEvent(new CustomEvent('selection-change', { bubbles: true, composed: true })));
  await expect(page.getByRole('toolbar', { name: 'Text formatting' })).toBeVisible();
});

test('optional highlighting preserves canonical exports and removes cleanly', async ({ page }) => {
  await page.goto('/dist/browser/');
  await choose(page, 'Sample document', 'Code snippet');
  const editor = page.locator('#editor');
  const original = await editor.evaluate((node: ARichTextElement) => ({ json: node.getJSON(), html: node.getHTML() }));
  await page.getByRole('checkbox', { name: 'Lightweight code highlighting' }).check();
  await expect(editor.locator('[data-art-token=keyword]').first()).toBeVisible();
  expect(await editor.evaluate((node: ARichTextElement) => ({ json: node.getJSON(), html: node.getHTML() }))).toEqual(original);
  await page.getByRole('checkbox', { name: 'Lightweight code highlighting' }).uncheck();
  await expect(editor.locator('[data-art-token]')).toHaveCount(0);
  expect(await editor.evaluate((node: ARichTextElement) => node.getHTML())).toBe(original.html);
});

test('format dropdown stays usable in modal focus mode and Escape dismisses only its menu', async ({ page }) => {
  await page.goto('/dist/browser/');
  await page.locator('#editor').evaluate((node: ARichTextElement) => { node.setText('Inside the modal'); node.focus(); node.toggleFocusMode(true); });
  const modal = page.getByRole('dialog', { name: 'Editor focus mode', exact: true });
  await expect(modal).toBeVisible();
  const trigger = page.getByRole('combobox', { name: 'Document format', exact: true });
  await trigger.click();
  await expect(page.getByRole('listbox', { name: 'Document format' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox', { name: 'Document format' })).toBeHidden();
  await expect(modal).toBeVisible();
  await chooseView(page, 'ART JSON');
  expect(await page.getByRole('textbox', { name: 'JSON document source' }).inputValue()).toContain('Inside the modal');
});
