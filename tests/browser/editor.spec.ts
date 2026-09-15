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

test('registers the editor and exposes an accessible textbox surface', async ({ page, browserName }) => {
  const editor = page.locator('#editor');
  const surface = editor.locator('[part="editor"]');

  await expect(surface).toHaveAttribute('role', 'textbox');
  await expect(surface).toHaveAttribute('aria-multiline', 'true');
  await expect.poll(() => surface.evaluate((node) => node.ariaLabelledByElements?.map((label) => label.textContent))).toEqual(['Body']);
  await expect(surface).toHaveAttribute('aria-placeholder', 'Write something…');
  await expect(surface).toHaveAttribute('data-placeholder', 'Write something…');
  // Playwright's DOM-based name calculation does not yet read reflected element
  // references. Chromium exposes its actual accessibility tree through CDP.
  if (browserName === 'chromium') {
    const cdp = await page.context().newCDPSession(page);
    const tree = await cdp.send('Accessibility.getFullAXTree');
    expect(tree.nodes.filter((node) => node.role?.value === 'textbox').map((node) => node.name?.value)).toEqual(['Body']);
    await cdp.detach();
  }
});

test('types through browser editing and supports engine undo', async ({ page }) => {
  const editor = page.locator('#editor');
  const surface = editor.locator('[part="editor"]');

  await surface.click();
  await surface.pressSequentially('hello');
  expect(await textValue(editor)).toBe('hello');

  // Each intercepted beforeinput is one explicit engine transaction/history step.
  await surface.press('ControlOrMeta+z');
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
  await surface.press('ControlOrMeta+a');
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

test('list Enter creates siblings, exits an empty item, and undoes atomically', async ({ page }) => {
  const editor = page.locator('#editor');
  const surface = editor.locator('[part="editor"]');
  await surface.click();
  await surface.pressSequentially('first');
  await page.getByRole('button', { name: 'Bullet list', exact: true }).click();
  await surface.press('Enter');
  await surface.pressSequentially('second');
  await expect(surface.locator('li')).toHaveCount(2);
  await expect(surface.locator('li').nth(1)).toHaveText('second');
  await surface.press('Enter');
  await expect(surface.locator('li')).toHaveCount(3);
  await surface.press('Enter');
  await expect(surface.locator('li')).toHaveCount(2);
  await expect(surface.locator(':scope > p')).toHaveCount(1);
  await surface.press('ControlOrMeta+z');
  await expect(surface.locator('li')).toHaveCount(3);
});

test('table controls edit dimensions and preserve undo', async ({ page }) => {
  const surface = page.locator('#editor').locator('[part="editor"]');
  await surface.click();
  await page.getByRole('button', { name: 'Insert table', exact: true }).click();
  await expect(surface.locator('tr')).toHaveCount(2);
  await page.getByRole('button', { name: 'Add table row', exact: true }).click();
  await expect(surface.locator('tr')).toHaveCount(3);
  await page.getByRole('button', { name: 'Add table column', exact: true }).click();
  await expect(surface.locator('tr').first().locator('td')).toHaveCount(3);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(surface.locator('tr').first().locator('td')).toHaveCount(2);
});
