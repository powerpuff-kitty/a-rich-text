import { chooseView } from './controls.js';
import { expect, test } from '@playwright/test';
import type { ARichTextElement } from '../../packages/web-component/src/index.js';

test.beforeEach(async ({ page }) => { await page.goto('/dist/browser/'); });

test('placeholder overlays the first caret line without adding document content', async ({ page }) => {
  const surface = page.locator('#editor [part="editor"]');
  await surface.click();
  const layout = await surface.evaluate((node) => {
    const pseudo = getComputedStyle(node, '::before');
    const paragraph = node.querySelector('p')!;
    return { position: pseudo.position, placeholderTop: node.getBoundingClientRect().top + parseFloat(pseudo.top) + 1,
      paragraphTop: paragraph.getBoundingClientRect().top };
  });
  expect(layout.position).toBe('absolute');
  expect(Math.abs(layout.placeholderTop - layout.paragraphTop)).toBeLessThan(2);
  await surface.pressSequentially('First line');
  await expect(surface.locator('p')).toHaveCount(1);
  await expect(surface).toHaveAttribute('data-empty', 'false');
});

test('task text aligns with its checkbox, which toggles canonically and supports undo', async ({ page }) => {
  const editor = page.locator('#editor');
  const surface = editor.locator('[part="editor"]');
  await surface.click();
  await surface.pressSequentially('Buy milk');
  await page.getByRole('button', { name: 'Task list', exact: true }).click();
  const checkbox = surface.getByRole('checkbox', { name: 'Task: Buy milk' });
  const box = (await checkbox.boundingBox())!;
  const text = (await surface.locator('li > p').boundingBox())!;
  expect(text.x).toBeGreaterThan(box.x + box.width);
  expect(box.y).toBeGreaterThanOrEqual(text.y);
  expect(box.y + box.height).toBeLessThanOrEqual(text.y + text.height + 2);
  await checkbox.check();
  expect(await editor.evaluate((node: ARichTextElement) => node.getJSON().content[0])).toMatchObject({ type: 'list', content: [{ checked: true }] });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(checkbox).not.toBeChecked();
  await editor.evaluate((node: ARichTextElement) => { node.readOnly = true; });
  await expect(checkbox).toBeDisabled();
});

test('toolbar uses SVG icons and hides unavailable table/history and configured tools', async ({ page }) => {
  const editor = page.locator('#editor');
  const surface = editor.locator('[part="editor"]');
  await surface.click();
  await expect(page.getByRole('button', { name: 'Add table row', exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Bold', exact: true }).locator('svg')).toHaveAttribute('aria-hidden', 'true');
  await page.getByRole('button', { name: 'Insert table', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Insert table', exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Add table row', exact: true })).toBeVisible();
  await editor.evaluate((node: ARichTextElement) => { node.tools = 'bold link'; });
  await expect(page.getByRole('button', { name: 'Add table row', exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Italic', exact: true })).toBeHidden();
  await surface.press('ControlOrMeta+i');
  await surface.pressSequentially('plain');
  expect(await editor.evaluate((node: ARichTextElement) => node.getHTML())).not.toContain('<em>');
});

test('source views preserve untouched data and explicitly apply HTML and Markdown', async ({ page }) => {
  const editor = page.locator('#editor');
  await editor.evaluate((node: ARichTextElement) => node.setHTML('<p><strong>Hello</strong></p>'));
  const original = await editor.evaluate((node: ARichTextElement) => node.getJSON());
  await chooseView(page, 'Markdown');
  await expect(page.getByRole('textbox', { name: 'MARKDOWN document source' })).toHaveValue('**Hello**');
  await chooseView(page, 'Text');
  await chooseView(page, 'Editor');
  expect(await editor.evaluate((node: ARichTextElement) => node.getJSON())).toEqual(original);
  await chooseView(page, 'HTML');
  await page.getByRole('textbox', { name: 'HTML document source' }).fill('<p><em>Safe</em><script>alert(1)</script></p>');
  await page.getByRole('button', { name: 'Apply changes', exact: true }).click();
  expect(await editor.evaluate((node: ARichTextElement) => node.getHTML())).toBe('<p><em>Safe</em></p>');
  await chooseView(page, 'Markdown');
  await page.getByRole('textbox', { name: 'MARKDOWN document source' }).fill('## Updated');
  await page.getByRole('button', { name: 'Apply changes', exact: true }).click();
  expect(await editor.evaluate((node: ARichTextElement) => node.getHTML())).toBe('<h2>Updated</h2>');
  expect(await editor.evaluate((node: ARichTextElement) => node.format)).toBe('html');
});

test('invalid JSON retains the draft, prevents stale form submission and can be discarded', async ({ page }) => {
  const editor = page.locator('#editor');
  await editor.evaluate((node: ARichTextElement) => node.setText('Saved'));
  await chooseView(page, 'JSON');
  const source = page.getByRole('textbox', { name: 'JSON document source' });
  await source.fill('{not valid');
  expect(await editor.evaluate((node: ARichTextElement) => node.checkValidity())).toBe(false);
  await page.getByRole('button', { name: 'Apply changes', exact: true }).click();
  await expect(source).toHaveAttribute('aria-invalid', 'true');
  await page.getByRole('combobox', { name: 'Document format' }).click();
  await expect(page.getByRole('option', { name: 'Editor', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  expect(await editor.evaluate((node: ARichTextElement) => node.getText())).toBe('Saved');
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
  expect(await editor.evaluate((node: ARichTextElement) => node.checkValidity())).toBe(true);
  await source.fill(JSON.stringify({ type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'From JSON' }] }] }));
  await page.getByRole('button', { name: 'Apply changes', exact: true }).click();
  expect(await editor.evaluate((node: ARichTextElement) => node.getText())).toBe('From JSON');
});

test('view attributes update live and readonly source remains inspectable', async ({ page }) => {
  const editor = page.locator('#editor');
  await editor.evaluate((node: ARichTextElement) => { node.views = 'json'; node.readOnly = true; });
  await expect(page.locator('a-rich-text-toolbar a-rich-text-select[data-role=view] option[value=html]')).toHaveCount(0);
  await chooseView(page, 'JSON');
  await expect(page.getByRole('textbox', { name: 'JSON document source' })).toHaveAttribute('readonly', '');
  const toolbar = page.getByRole('toolbar', { name: 'Text formatting' });
  await expect(toolbar.getByRole('button')).toHaveCount(1);
  await expect(toolbar.getByRole('button', { name: 'Enter focus mode', exact: true })).toBeVisible();
  await editor.evaluate((node: ARichTextElement) => { node.views = ''; });
  await expect(editor.locator('[part="editor"]')).toBeVisible();
  await expect(editor.locator('[part="view-switcher"]')).toBeHidden();
});
