import { expect, test } from '@playwright/test';
import type { ARichTextElement } from '../../packages/web-component/src/index.js';

test('optional Delta profile auto-imports text blocks and submits canonical ART', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/dist/browser/quill-delta.html');
  const source = page.locator('#document [part="source"]');
  await expect(source).toHaveValue('{"ops":[{"insert":"Portable text\\n"}]}');
  await source.fill(JSON.stringify({ ops: [{ insert: 'Title' }, { insert: '\n', attributes: { header: 2 } }] }));
  await expect.poll(() => page.locator('#document').evaluate(node => (node as ARichTextElement).sourceDirty)).toBe(false);
  await page.getByRole('button', { name: 'Submit ART JSON' }).click();
  await expect(page.locator('output')).toContainText('"type":"heading"');
  await expect(page.locator('output')).toContainText('"level":2');
  expect(errors).toEqual([]);
});

test('Delta losses require toolbar confirmation and rejected changes preserve the document', async ({ page }) => {
  await page.goto('/dist/browser/quill-delta.html');
  const source = page.locator('#document [part="source"]');
  await expect(source).toHaveValue(/Portable text/);
  await source.fill(JSON.stringify({ ops: [{ insert: 'Reviewed\n', attributes: { color: 'red' } }] }));
  await expect(page.locator('#document [part="source-error"]')).toContainText('Unsupported Delta attributes');
  expect(await page.locator('#document').evaluate(node => (node as ARichTextElement).getText())).toBe('Portable text');
  await page.getByRole('button', { name: 'Submit ART JSON' }).click();
  await expect(page.locator('output')).toBeEmpty();
  await page.locator('art-toolbar').getByRole('button', { name: 'Apply changes', exact: true }).click();
  await expect.poll(() => page.locator('#document').evaluate(node => (node as ARichTextElement).getText())).toBe('Reviewed');
  await source.fill('{"ops":[{"retain":1}]}');
  await expect(source).toHaveAttribute('aria-invalid', 'true');
  expect(await page.locator('#document').evaluate(node => (node as ARichTextElement).getText())).toBe('Reviewed');
});
