import { expect, test } from '@playwright/test';
import type { ARichTextElement } from '../../packages/web-component/src/index.js';
const atom = { type: 'extensionInline', name: 'acme:mention', attrs: { id: '42' }, fallbackText: '@Alice' };
const value = { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }, atom, { type: 'text', text: 'b' }] }] };
test.beforeEach(async ({ page }) => { await page.goto('/dist/browser/'); await page.locator('#editor').waitFor(); });
for (const [key, offset] of [['Backspace', 2], ['Delete', 1]] as const) {
  test(`inline extension ${key} deletes one atom and undo restores its data`, async ({ page }) => {
    const editor = page.locator('#editor');
    await editor.evaluate((node: ARichTextElement, { value, offset }) => {
      node.setJSON(value); node.focus();
      const point = { blockPath: [0], offset };
      node.dispatch({ operations: [], selection: { anchor: point, head: point } });
    }, { value, offset });
    await expect(editor.locator('[data-art-extension-inline]')).toHaveAttribute('contenteditable', 'false');
    await page.keyboard.press(key);
    expect(await editor.evaluate((node: ARichTextElement) => node.getText())).toBe('ab');
    await editor.evaluate((node: ARichTextElement) => node.undo());
    expect(await editor.evaluate((node: ARichTextElement) => node.getJSON())).toEqual(value);
    await page.keyboard.type('!');
    expect(await editor.evaluate((node: ARichTextElement) => node.getText())).toBe(offset === 2 ? 'a@Alice!b' : 'a!@Aliceb');
  });
}
test('native DOM reimport and rich paste retain inline metadata', async ({ page }) => {
  const editor = page.locator('#editor');
  await editor.evaluate((node: ARichTextElement, value) => node.setJSON(value), value);
  await editor.locator('[part=editor]').dispatchEvent('input');
  expect(await editor.evaluate((node: ARichTextElement) => node.getJSON())).toEqual(value);
  await editor.evaluate((node: ARichTextElement) => {
    const html = node.getHTML(); node.setText(''); node.focus();
    const point = { blockPath: [0], offset: 0 };
    node.dispatch({ operations: [], selection: { anchor: point, head: point } });
    const data = new DataTransfer(); data.setData('text/html', html);
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    // Firefox ignores clipboardData in the constructor for synthetic events.
    Object.defineProperty(event, 'clipboardData', { value: data });
    node.shadowRoot!.querySelector('[part=editor]')!.dispatchEvent(event);
  });
  expect(await editor.evaluate((node: ARichTextElement) => node.getJSON())).toEqual(value);
});

test('public package consumer inserts a mention and survives runtime removal', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/dist/browser/inline-extensions/');
  const editor = page.locator('#editor');
  await editor.locator('[part=editor]').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.getByRole('button', { name: 'Insert @Alice' }).click();
  await expect(page.getByRole('status')).toHaveText('Mention inserted.');
  await expect(editor.locator('[data-art-extension-inline] strong')).toHaveText('@Alice');
  const before = await editor.evaluate((node: ARichTextElement) => node.getJSON());
  await page.getByRole('button', { name: 'Remove custom renderer' }).click();
  await expect(editor.locator('[data-art-extension-inline]')).toHaveText('@Alice');
  await expect(editor.locator('[data-art-extension-inline] strong')).toHaveCount(0);
  expect(await editor.evaluate((node: ARichTextElement) => node.getJSON())).toEqual(before);
  expect(errors).toEqual([]);
});

test('invalid inline clipboard envelopes fail without changing the document', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const editor = page.locator('#editor');
  await editor.evaluate((node: ARichTextElement, value) => node.setJSON(value), value);
  await editor.locator('[part=editor]').click();
  const context = await editor.evaluate((node: ARichTextElement) => {
    let context = '';
    node.addEventListener('error', event => { context = (event as CustomEvent).detail.context; event.stopPropagation(); }, { once: true });
    const data = new DataTransfer(); data.setData('text/html', '<p><span data-art-extension-inline="bad">broken</span></p>');
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: data });
    node.shadowRoot!.querySelector('[part=editor]')!.dispatchEvent(event);
    return context;
  });
  expect(context).toBe('paste-invalid-payload');
  expect(await editor.evaluate((node: ARichTextElement) => node.getJSON())).toEqual(value);
  expect(errors).toEqual([]);
});
