import { expect, test } from '@playwright/test';

test('gallery navigation targets every embedded live example', async ({ page }) => {
  await page.goto('/dist/browser/components/');
  const links = page.getByRole('navigation', { name: 'Component examples' }).getByRole('link');
  await expect(links).toHaveCount(25);
  await expect(page.locator('iframe')).toHaveCount(25);
  await links.filter({ hasText: /^Short tag aliases$/ }).click();
  await expect(page).toHaveURL(/#short-tags$/);
  const frame = page.frameLocator('#short-tags iframe');
  await expect(frame.locator('body')).toHaveAttribute('data-ready', 'true');
  await expect(frame.locator('art-editor')).toBeVisible();
  await expect(frame.locator('body > header')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('background example initialization preserves gallery scroll and focus', async ({ page }) => {
  await page.goto('/dist/browser/components/');
  // Force every lazy frame to finish, including dialogs far below the viewport.
  await page.locator('iframe').evaluateAll(frames => frames.forEach(frame => frame.setAttribute('loading', 'eager')));
  await expect.poll(() => page.locator('iframe').evaluateAll(frames => frames.filter(frame => {
    const doc = (frame as HTMLIFrameElement).contentDocument;
    return doc?.body?.dataset.example && doc.body.dataset.ready === 'true';
  }).length)).toBe(23);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await page.evaluate(() => scrollY)).toBe(0);
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('IFRAME');
  const nav = page.getByRole('navigation', { name: 'Component examples' });
  await nav.getByRole('link', { name: 'Code editor', exact: true }).click();
  const frame = page.frameLocator('#code-editor iframe');
  await expect(frame.getByRole('dialog')).toBeHidden();
  await frame.getByRole('button', { name: 'Open code editor', exact: true }).click();
  await expect(frame.getByRole('dialog')).toBeVisible();
});

test('example frames fit content and shrink again after content is removed', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/dist/browser/components/');
  await page.getByRole('navigation').getByRole('link', { name: 'Standard editor', exact: true }).click();
  const frame = page.locator('#standard-editor iframe');
  const body = page.frameLocator('#standard-editor iframe').locator('body');
  await expect(body).toHaveAttribute('data-ready', 'true');
  const difference = () => frame.evaluate(node => {
    const iframe = node as HTMLIFrameElement;
    return Math.abs(iframe.getBoundingClientRect().height - iframe.contentDocument!.body.getBoundingClientRect().height - 2);
  });
  await expect.poll(difference).toBeLessThan(2);
  const original = (await frame.boundingBox())!.height;
  await body.evaluate(node => { const block = document.createElement('div'); block.id = 'height-probe'; block.style.height = '400px'; node.append(block); });
  await expect.poll(async () => (await frame.boundingBox())!.height).toBeGreaterThan(original + 390);
  await body.locator('#height-probe').evaluate(node => node.remove());
  await expect.poll(async () => Math.abs((await frame.boundingBox())!.height - original)).toBeLessThan(2);
  await expect.poll(difference).toBeLessThan(2);
  expect(errors).toEqual([]);
});
