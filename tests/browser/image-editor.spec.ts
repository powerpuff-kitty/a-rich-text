import { expect, test } from '@playwright/test';
import type { ARichTextElement } from '../../packages/web-component/src/index.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==', 'base64');
const file = { name: 'photo.png', mimeType: 'image/png', buffer: png };

test.beforeEach(async ({ page }) => {
  await page.route('**/test-image.png', route => route.fulfill({ contentType: 'image/png', body: png }));
  await page.goto('/dist/browser/');
});

test('image URL authoring, previews, alt text, formats and undo are canonical', async ({ page }) => {
  const editor = page.locator('#editor');
  const surface = editor.locator('[part="editor"]');
  await surface.click();
  await page.getByRole('button', { name: 'Insert image', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Image', exact: true });
  await expect(dialog.getByRole('textbox', { name: 'Image URL', exact: true })).toBeFocused();
  await expect(dialog.locator('input[type="file"]')).toBeHidden();
  await dialog.getByRole('textbox', { name: 'Image URL', exact: true }).fill('/test-image.png');
  await dialog.getByRole('button', { name: 'Apply image', exact: true }).click();
  await expect(dialog.locator('[part="image-error"]')).toContainText('alternative text');
  await dialog.getByRole('textbox', { name: 'Alternative text', exact: true }).fill('A tree');
  await dialog.getByRole('textbox', { name: 'Title (optional)' }).fill('Tree title');
  await dialog.getByRole('spinbutton', { name: 'Width (pixels)' }).fill('120');
  await dialog.getByRole('spinbutton', { name: 'Height (pixels)' }).fill('80');
  await dialog.getByRole('button', { name: 'Preview image', exact: true }).click();
  await expect.poll(() => dialog.locator('img').evaluate(node => (node as HTMLImageElement).naturalWidth)).toBe(1);
  await expect(surface.locator('img')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Apply image', exact: true }).click();
  await expect(surface.getByRole('img', { name: 'A tree', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit image', exact: true }).focus();
  await page.keyboard.press('Enter');
  await dialog.getByRole('textbox', { name: 'Alternative text', exact: true }).fill('A different tree');
  await dialog.getByRole('button', { name: 'Apply image', exact: true }).click();
  await expect(surface.getByRole('img', { name: 'A different tree', exact: true })).toBeVisible();
  await editor.evaluate(node => (node as ARichTextElement).undo());
  await expect(surface.getByRole('img', { name: 'A tree', exact: true })).toBeVisible();
  const expected = { type: 'image', src: '/test-image.png', alt: 'A tree', title: 'Tree title', width: 120, height: 80 };
  await surface.dispatchEvent('input');
  expect(await editor.evaluate(node => (node as ARichTextElement).getJSON().content.find(block => block.type === 'image'))).toEqual(expected);
  const html = await editor.evaluate(node => (node as ARichTextElement).getHTML());
  expect(html).not.toContain('Edit image');
  expect(html).not.toContain('data-art');
  await editor.evaluate((node, html) => (node as ARichTextElement).setHTML(html), html);
  expect(await editor.evaluate(node => (node as ARichTextElement).getJSON().content.find(block => block.type === 'image'))).toEqual(expected);
  await page.getByRole('button', { name: 'Edit image', exact: true }).click();
  await dialog.getByRole('button', { name: 'Remove image', exact: true }).click();
  await expect(surface.locator('img')).toHaveCount(0);
  await editor.evaluate(node => (node as ARichTextElement).undo());
  await expect(surface.getByRole('img', { name: 'A tree', exact: true })).toBeVisible();
  await editor.evaluate(node => { const rich = node as ARichTextElement; rich.setMarkdown(rich.getMarkdown()); });
  expect(await editor.evaluate(node => (node as ARichTextElement).getJSON().content.find(block => block.type === 'image')))
    .toMatchObject({ type: 'image', src: '/test-image.png', alt: 'A tree', title: 'Tree title' });
});

test('image validation, decoration, cancellation and stale/configured drafts are protected', async ({ page }) => {
  const editor = page.locator('#editor');
  await editor.evaluate(node => (node as ARichTextElement).setHTML('<blockquote><img src="/test-image.png" alt="Original"></blockquote>'));
  const dialog = page.getByRole('dialog', { name: 'Image', exact: true });
  await page.getByRole('button', { name: 'Edit image', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Image URL', exact: true }).fill('javascript:alert(1)');
  await dialog.getByRole('button', { name: 'Apply image', exact: true }).click();
  await expect(dialog.locator('[part="image-error"]')).toContainText('HTTP(S)');
  await dialog.getByRole('textbox', { name: 'Image URL', exact: true }).fill('/test-image.png');
  await dialog.getByRole('spinbutton', { name: 'Width (pixels)' }).fill('0');
  await dialog.getByRole('button', { name: 'Apply image', exact: true }).click();
  await expect(dialog.locator('[part="image-error"]')).toContainText('positive whole');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Edit image', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Edit image', exact: true }).click();
  await dialog.getByRole('checkbox', { name: 'Decorative image' }).check();
  await dialog.getByRole('button', { name: 'Apply image', exact: true }).click();
  await expect(editor.locator('[part="editor"] img')).toHaveAttribute('alt', '');
  await page.getByRole('button', { name: 'Edit image', exact: true }).click();
  await editor.evaluate(node => (node as ARichTextElement).setText('External update'));
  await dialog.getByRole('button', { name: 'Apply image', exact: true }).click();
  await expect(dialog.locator('[part="image-error"]')).toContainText('document changed');
  expect(await editor.evaluate(node => (node as ARichTextElement).getText())).toBe('External update');
  await editor.evaluate(node => node.setAttribute('readonly', ''));
  await expect(dialog).not.toBeVisible();
  await editor.evaluate(node => { node.removeAttribute('readonly'); (node as ARichTextElement).setHTML('<img src="/test-image.png" alt="Tree">'); node.setAttribute('tools', 'bold'); });
  await expect(page.getByRole('button', { name: 'Edit image', exact: true })).toHaveCount(0);
  expect(await editor.evaluate(node => (node as ARichTextElement).openImageEditor([0]))).toBe(false);
});

test('host uploads preview locally, retry errors and apply only on request', async ({ page }) => {
  const editor = page.locator('#editor');
  await editor.evaluate(node => {
    let attempts = 0;
    (node as ARichTextElement).imageUploader = async (_file, context) => {
      context.onProgress({ loaded: 1, total: 2 });
      if (++attempts === 1) throw new Error('Temporary upload failure');
      return { src: '/test-image.png', width: 100, height: 100 };
    };
  });
  await editor.locator('[part="editor"]').click();
  await page.getByRole('button', { name: 'Insert image', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Image', exact: true });
  await dialog.locator('input[type="file"]').setInputFiles(file);
  await expect(dialog.locator('img')).toHaveAttribute('src', /^blob:/);
  await expect(dialog.getByRole('button', { name: 'Apply image', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Upload image', exact: true }).click();
  await expect(dialog.locator('[part="image-error"]')).toHaveText('Temporary upload failure');
  await dialog.getByRole('button', { name: 'Upload image', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: 'Image URL', exact: true })).toHaveValue('/test-image.png');
  await expect(editor.locator('[part="editor"] img')).toHaveCount(0);
  await dialog.getByRole('textbox', { name: 'Alternative text', exact: true }).fill('Uploaded tree');
  await dialog.getByRole('button', { name: 'Apply image', exact: true }).click();
  await expect(editor.locator('[part="editor"] img')).toHaveAttribute('alt', 'Uploaded tree');
});

test('cancelled uploads ignore late completion and dispose local previews', async ({ page }) => {
  const editor = page.locator('#editor');
  await page.evaluate(() => {
    const state = window as unknown as { finish: () => void; aborted: boolean; revoked: string[] };
    state.aborted = false; state.revoked = [];
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = url => { state.revoked.push(url); revoke(url); };
    (document.querySelector('#editor') as ARichTextElement).imageUploader = (_file, context) => new Promise(resolve => {
      context.onProgress({ loaded: 1, total: 2 });
      context.signal.addEventListener('abort', () => { state.aborted = true; });
      state.finish = () => resolve({ src: '/test-image.png' });
    });
  });
  await editor.locator('[part="editor"]').click();
  await page.getByRole('button', { name: 'Insert image', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Image', exact: true });
  await dialog.locator('input[type="file"]').setInputFiles(file);
  const preview = await dialog.locator('img').getAttribute('src');
  await dialog.getByRole('button', { name: 'Upload image', exact: true }).click();
  await expect(dialog.locator('[part="image-progress"]')).toHaveText('Uploading 50%');
  await dialog.getByRole('button', { name: 'Cancel upload', exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { aborted: boolean }).aborted)).toBe(true);
  await page.evaluate(() => (window as unknown as { finish: () => void }).finish());
  await expect(dialog.getByRole('textbox', { name: 'Image URL', exact: true })).toHaveValue('');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { revoked: string[] }).revoked)).toContain(preview);
  await expect(editor.locator('[part="editor"] img')).toHaveCount(0);
});

test('form reset, readonly and disconnection abort pending image uploads', async ({ page }) => {
  const editor = page.locator('#editor');
  for (const action of ['reset', 'readonly', 'disconnect']) {
    await page.evaluate(() => {
      const state = window as unknown as { finish: () => void; aborted: boolean };
      state.aborted = false;
      const rich = document.querySelector('#editor') as ARichTextElement;
      rich.removeAttribute('readonly');
      rich.setHTML('<img src="/test-image.png" alt="Original">');
      rich.imageUploader = (_file, context) => new Promise(resolve => {
        context.signal.addEventListener('abort', () => { state.aborted = true; });
        state.finish = () => resolve({ src: '/late-image.png' });
      });
    });
    await page.getByRole('button', { name: 'Edit image', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Image', exact: true });
    await dialog.locator('input[type="file"]').setInputFiles(file);
    await dialog.getByRole('button', { name: 'Upload image', exact: true }).click();
    await editor.evaluate((node, action) => {
      if (action === 'reset') (node as ARichTextElement).closest('form')!.reset();
      else if (action === 'readonly') node.setAttribute('readonly', '');
      else { const parent = node.parentElement!; node.remove(); parent.append(node); }
    }, action);
    expect(await page.evaluate(() => (window as unknown as { aborted: boolean }).aborted)).toBe(true);
    await page.evaluate(() => (window as unknown as { finish: () => void }).finish());
    await expect(dialog).not.toBeVisible();
    await expect(editor.locator('[part="image-preview"]')).not.toHaveAttribute('src');
    expect(await editor.evaluate(node => (node as ARichTextElement).getHTML())).not.toContain('late-image');
  }
});
