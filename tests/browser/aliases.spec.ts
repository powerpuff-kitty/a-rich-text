import { expect, test } from '@playwright/test';
import { chooseView } from './controls.js';
import type { ARichTextElement } from '../../packages/web-component/src/index.js';

test('short aliases support native forms, source toolbar actions, presets and focus mode', async ({ page }) => {
  await page.goto('/dist/browser/components/short-tags.html');
  const editor = page.locator('art-editor'); const toolbar = page.locator('art-toolbar');
  await editor.evaluate(node => {
    const form = document.createElement('form'); form.id = 'alias-form'; node.closest('art-shell')!.before(form); form.append(node.closest('art-shell')!);
    node.setAttribute('name', 'body'); const rich = node as ARichTextElement;
    rich.required = true; rich.setText('');
  });
  expect(await page.locator('#alias-form').evaluate(form => (form as HTMLFormElement).checkValidity())).toBe(false);
  await editor.locator('[part="editor"]').click();
  await editor.locator('[part="editor"]').pressSequentially('Alias content');
  expect(await page.locator('#alias-form').evaluate(form => new FormData(form as HTMLFormElement).get('body'))).toBe('<p>Alias content</p>');
  await editor.evaluate(node => { (node as ARichTextElement).preset = 'document'; });
  await expect(page.locator('art-shell')).toHaveAttribute('data-preset', 'document');
  await expect(toolbar).toHaveCSS('border-bottom-width', '1px');
  await chooseView(page, 'HTML'); await editor.locator('[part="source"]').fill('<p>Source alias</p>');
  await toolbar.getByRole('button', { name: 'Apply changes', exact: true }).click();
  await toolbar.getByRole('button', { name: 'Enter focus mode', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Editor focus mode' })).toBeVisible();
  await expect(editor.locator('art-toolbar')).toHaveCount(1);
  await page.getByRole('button', { name: 'Exit focus mode', exact: true }).first().click();
  await expect(page.locator('art-shell > art-toolbar')).toHaveCount(1);
  expect(await page.locator('#alias-form').evaluate(form => new FormData(form as HTMLFormElement).get('body'))).toBe('<p>Source alias</p>');
});

test('short dropdown and mixed toolbar/editor names remain interoperable', async ({ page }) => {
  await page.goto('/dist/browser/components/short-tags.html');
  await page.evaluate(() => {
    const select = document.createElement('art-select'); select.setAttribute('label', 'Alias choice');
    select.innerHTML = '<option value="one">First</option><option value="two">Second</option>'; document.body.append(select);
  });
  await page.getByRole('combobox', { name: 'Alias choice' }).click();
  await page.getByRole('option', { name: 'Second', exact: true }).click();
  await expect(page.locator('art-select')).toHaveAttribute('value', 'two');
  for (const [editorTag, toolbarTag] of [['art-editor', 'a-rich-text-toolbar'], ['a-rich-text', 'art-toolbar']]) {
    await page.locator('#component').evaluate((component, tags) => {
      component.innerHTML = `<art-shell><${tags[1]} for="mixed"></${tags[1]}><${tags[0]} id="mixed" aria-label="Mixed editor"></${tags[0]}></art-shell>`;
      const editor = component.querySelector('#mixed') as ARichTextElement;
      editor.setText('Mixed'); editor.focus();
      editor.dispatch({ operations: [], selection: { anchor: { blockPath: [0], offset: 0 }, head: { blockPath: [0], offset: 5 } } });
    }, [editorTag!, toolbarTag!]);
    await page.locator('#component').getByRole('button', { name: 'Bold', exact: true }).click();
    expect(await page.locator('#mixed').evaluate(node => (node as ARichTextElement).getHTML())).toBe('<p><strong>Mixed</strong></p>');
  }
});
