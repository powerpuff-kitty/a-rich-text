import { expect, test } from '@playwright/test';
import type { ARichTextElement } from '../../packages/web-component/src/index.js';

test.beforeEach(async ({ page }) => {
  await page.goto('/dist/browser/');
  await page.locator('#editor').evaluate(node => {
    const editor = node as ARichTextElement;
    editor.registerFormatProfile({
      id: 'demo:article-v1', family: 'json', label: 'Article JSON',
      import: source => {
        const data = JSON.parse(source);
        if (typeof data.body !== 'string') throw new Error('Article body must be text');
        return { value: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: data.body }] }] },
          diagnostics: data.loss ? [{ code: 'style', severity: 'loss', message: 'Article styles will be removed' }] : [] };
      },
      export: doc => ({ value: JSON.stringify({ body: doc.content.map(block => block.type === 'paragraph' ? block.content?.map(text => text.text).join('') : '').join('\n') }) }),
    });
    editor.profiles = ['art:html-v1', 'art:json-v1', 'demo:article-v1'];
    editor.setText('Original'); editor.sourceProfile = 'demo:article-v1';
  });
});

test('custom source imports automatically and output uses a separate profile in native forms', async ({ page }) => {
  const source = page.locator('#editor [part="source"]');
  await expect(source).toHaveValue('{"body":"Original"}');
  await source.fill('{"body":"Changed"}');
  await expect.poll(() => page.locator('#editor').evaluate(node => (node as ARichTextElement).sourceDirty)).toBe(false);
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(page.locator('#submitted')).toHaveText('<p>Changed</p>');
  await page.locator('#editor').evaluate(node => { const editor = node as ARichTextElement; editor.format = 'json'; editor.profile = 'demo:article-v1'; });
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(page.locator('#submitted')).toHaveText('{"body":"Changed"}');
});

test('losses pause automatic import until the toolbar Apply button confirms them', async ({ page }) => {
  const source = page.locator('#editor [part="source"]');
  await source.fill('{"body":"Reviewed","loss":true}');
  await expect(page.locator('#editor [part="source-error"]')).toContainText('Article styles will be removed');
  expect(await page.locator('#editor').evaluate(node => (node as ARichTextElement).getText())).toBe('Original');
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(page.locator('#submitted')).toBeEmpty();
  await page.locator('a-rich-text-toolbar').getByRole('button', { name: 'Apply changes', exact: true }).click();
  await expect.poll(() => page.locator('#editor').evaluate(node => (node as ARichTextElement).getText())).toBe('Reviewed');
});

test('profile menu exposes only allowed profiles and preserves malformed drafts', async ({ page }) => {
  const toolbar = page.locator('a-rich-text-toolbar');
  const trigger = toolbar.getByRole('combobox', { name: 'Document format' });
  await trigger.click();
  await expect(toolbar.getByRole('option')).toHaveCount(4);
  await toolbar.getByRole('option', { name: 'JSON — ART JSON', exact: true }).click();
  await expect(page.locator('#editor [part="source"]')).toHaveValue(/"type":"doc"/);
  await page.locator('#editor [part="source"]').fill('{');
  await expect(page.locator('#editor [part="source"]')).toHaveAttribute('aria-invalid', 'true');
  await trigger.click(); await expect(toolbar.getByRole('option', { name: 'JSON — Article JSON', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await toolbar.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await trigger.click(); await toolbar.getByRole('option', { name: 'JSON — Article JSON', exact: true }).click();
  await expect(page.locator('#editor [part="source"]')).toHaveValue('{"body":"Original"}');
});

test('late registration imports declarative values and invalid profiles block submission', async ({ page }) => {
  await page.locator('#editor').evaluate(node => {
    const editor = node as ARichTextElement;
    editor.profile = 'unknown:profile-v1';
  });
  await expect(page.locator('#editor [part="profile-error"]')).toBeVisible();
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(page.locator('#submitted')).toBeEmpty();
  const text = await page.evaluate(() => {
    const host = document.createElement('div');
    host.innerHTML = '<art-editor format="json" profile="late:article-v1" value=\'{"body":"Initial"}\'></art-editor>';
    document.body.append(host);
    const editor = host.firstElementChild as ARichTextElement;
    editor.registerFormatProfile({ id: 'late:article-v1', family: 'json', label: 'Article',
      import: source => ({ value: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: JSON.parse(source).body }] }] } }),
      export: () => ({ value: '{}' }) });
    return editor.getText();
  });
  expect(text).toBe('Initial');
});

test('standalone custom profile example submits its initial value and edits', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/dist/browser/format-profiles.html');
  const source = page.locator('art-editor [part="source"]');
  await expect(source).toHaveValue('{"body":"A portable article"}');
  await source.fill('{"body":"Example edited"}');
  await page.getByRole('button', { name: 'Submit Article JSON' }).click();
  await expect(page.locator('output')).toHaveText('{"body":"Example edited"}');
  expect(errors).toEqual([]);
});
