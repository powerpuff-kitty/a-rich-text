import { expect, test } from '@playwright/test';
import { chooseView } from './controls.js';
import type { ARichTextElement } from '../../packages/web-component/src/index.js';

test.beforeEach(async ({ page }) => { await page.goto('/dist/browser/'); });

test('automatic source updates retain raw input and submit without Apply', async ({ page }) => {
  await chooseView(page, 'HTML');
  const source = page.locator('#editor [part="source"]');
  await source.fill('<p><b>Automatic</b></p>');
  await expect.poll(() => page.locator('#editor').evaluate(node => (node as ARichTextElement).getText())).toBe('Automatic');
  await expect(source).toHaveValue('<p><b>Automatic</b></p>');
  await expect(page.getByRole('button', { name: 'Apply changes', exact: true })).toBeHidden();
  await source.fill('<p>Latest submission</p>');
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(page.locator('#submitted')).toHaveText('<p>Latest submission</p>');
});

test('invalid JSON preserves data and blocks stale submission until corrected', async ({ page }) => {
  await page.locator('#editor').evaluate(node => (node as ARichTextElement).setText('Saved'));
  await chooseView(page, 'ART JSON');
  const source = page.locator('#editor [part="source"]'); const valid = await source.inputValue();
  await source.fill('{');
  await expect(source).toHaveAttribute('aria-invalid', 'true');
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(page.locator('#submitted')).toBeEmpty();
  expect(await page.locator('#editor').evaluate(node => (node as ARichTextElement).getText())).toBe('Saved');
  await source.fill(valid.replace('Saved', 'Corrected'));
  await expect.poll(() => page.locator('#editor').evaluate(node => (node as ARichTextElement).sourceDirty)).toBe(false);
  await chooseView(page, 'Editor');
  await expect(page.locator('#editor [part="editor"]')).toHaveText('Corrected');
});

test('optional formatter loads local chunks and detection distinguishes foreign profiles', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.getByLabel('Source formatting (Prettier)').check();
  await chooseView(page, 'ART JSON');
  const source = page.locator('#editor [part="source"]');
  const compact = JSON.stringify(JSON.parse(await source.inputValue()));
  await source.fill(compact);
  await page.getByRole('button', { name: 'Format source', exact: true }).click();
  await expect(source).toHaveValue(/\n/);
  expect(JSON.parse(await source.inputValue())).toEqual(JSON.parse(compact));
  await page.getByText('Detect an input format', { exact: true }).click();
  await page.getByLabel('Input sample').fill('{"ops":[{"insert":"Hello\\n"}]}');
  await expect(page.locator('#detected')).toContainText('quill-delta');
  await expect(page.locator('#detected')).toContainText('No compatible built-in converter');
  expect(errors).toEqual([]);
});

test('source actions stay in traditional and inline toolbars with no content action row', async ({ page }) => {
  const toolbar = page.locator('a-rich-text-toolbar');
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).sourceUpdate = 'manual'; });
  await chooseView(page, 'HTML');
  const source = page.locator('#editor [part="source"]');
  await source.fill('<p>Draft</p>');
  await expect(page.locator('#editor [part="source-panel"] button')).toHaveCount(0);
  await toolbar.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(source).toHaveValue('<p></p>');
  await toolbar.evaluate(node => node.setAttribute('mode', 'inline'));
  await source.fill('<p>Applied in toolbar</p>');
  await toolbar.getByRole('button', { name: 'Apply changes', exact: true }).click();
  expect(await page.locator('#editor').evaluate(node => (node as ARichTextElement).getText())).toBe('Applied in toolbar');
  await expect(toolbar.locator('[part="toolbar-header"] [part="source-actions"]')).toBeHidden();
});
