import type { Page } from '@playwright/test';
export async function chooseView(page: Page, label: string) {
  await page.getByRole('combobox', { name: 'Document format', exact: true }).click();
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await page.getByRole('option', { name: new RegExp(`^(?:[A-Z]+ — )?${escaped}$`) }).click();
}
export async function chooseStyle(page: Page, value: string) {
  await page.getByRole('combobox', { name: 'Text style', exact: true }).click();
  await page.locator(`a-rich-text-select[data-role=block] [role=option][data-value="${value}"]`).click();
}
