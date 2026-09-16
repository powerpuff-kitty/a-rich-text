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
