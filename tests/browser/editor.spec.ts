import { expect, test, type Locator } from '@playwright/test';

async function textValue(editor: Locator): Promise<string> {
  return editor.evaluate((node: HTMLElement) =>
    (node as HTMLElement & { getText(): string }).getText(),
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/browser/');
  await page.locator('#editor').waitFor();
});

test('registers the editor and exposes an accessible textbox surface', async ({ page }) => {
  const editor = page.locator('#editor');
  const surface = editor.locator('[part="editor"]');

  await expect(surface).toHaveAttribute('role', 'textbox');
  await expect(surface).toHaveAttribute('aria-multiline', 'true');
  await expect(surface).toHaveAttribute('aria-labelledby', 'body-label');
  await expect(surface).toHaveAttribute('aria-placeholder', 'Write something…');
  await expect(surface).toHaveAttribute('data-placeholder', 'Write something…');
  // This verifies the accessibility tree, not only the raw ARIA attribute.
  await expect(page.getByRole('textbox', { name: 'Body' })).toHaveCount(1);
});

test('types through browser editing and supports engine undo', async ({ page }) => {
  const editor = page.locator('#editor');
  const surface = editor.locator('[part="editor"]');

  await surface.click();
  await surface.pressSequentially('hello');
  expect(await textValue(editor)).toBe('hello');

  // Each intercepted beforeinput is one explicit engine transaction/history step.
  await surface.press('Control+z');
  expect(await textValue(editor)).toBe('hell');
});

test('participates in native FormData using the selected serialization format', async ({ page }) => {
  const editor = page.locator('#editor');
  await editor.evaluate((node: HTMLElement) => {
    const rich = node as HTMLElement & {
      format: 'html' | 'json' | 'markdown' | 'text';
      setMarkdown(value: string): void;
    };
    rich.format = 'markdown';
    rich.setMarkdown('**hello**');
  });

  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.locator('#submitted')).toHaveJSProperty('value', '**hello**');
});

test('toolbar formatting routes through editor commands', async ({ page }) => {
  const editor = page.locator('#editor');
  const surface = editor.locator('[part="editor"]');
  await editor.evaluate((node: HTMLElement) => {
    (node as HTMLElement & { setText(value: string): void }).setText('hello');
  });

  await surface.click();
  await surface.press('Control+a');
  await page.getByRole('button', { name: 'Bold' }).click();

  const html = await editor.evaluate((node: HTMLElement) =>
    (node as HTMLElement & { getHTML(): string }).getHTML(),
  );
  expect(html).toContain('<strong>hello</strong>');
});

test('readonly prevents browser typing from changing canonical ART', async ({ page }) => {
  const editor = page.locator('#editor');
  const surface = editor.locator('[part="editor"]');
  await editor.evaluate((node: HTMLElement) => {
    const rich = node as HTMLElement & { setText(value: string): void; readOnly: boolean };
    rich.setText('safe');
    rich.readOnly = true;
  });

  await surface.click();
  await surface.pressSequentially('x');
  expect(await textValue(editor)).toBe('safe');
  await expect(surface).toHaveAttribute('aria-readonly', 'true');
});

test('renders portable extension fallback without an extension runtime', async ({ page }) => {
  const editor = page.locator('#editor');
  await editor.evaluate((node: HTMLElement) => {
    (node as HTMLElement & { setJSON(value: unknown): void }).setJSON({
      type: 'doc',
      version: 1,
      content: [{
        type: 'extensionBlock',
        name: 'acme:card',
        attrs: { id: '123' },
        fallbackText: 'Portable card',
      }],
    });
  });

  const extension = editor.locator('[data-art-extension-block="acme:card"]');
  await expect(extension).toContainText('Portable card');
  await expect(extension).toHaveAttribute('data-art-extension-attrs', '{"id":"123"}');
});
