import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { test, expect, type Page } from '@playwright/test';

let url: string;
let server: Server;
// Serve production artifacts without a dev server's injected HMR/network scripts.
test.beforeEach(async () => {
  const files = new Map([
    ['/dist/browser/local-first/', 'dist/browser/local-first/index.html'],
    ['/dist/browser/local-first/index.html', 'dist/browser/local-first/index.html'],
    ['/dist/browser/local-first/app.js', 'dist/browser/local-first/app.js'],
    ['/dist/browser/local-first/sw.js', 'dist/browser/local-first/sw.js'],
    ['/dist/browser/a-rich-text.js', 'dist/browser/a-rich-text.js'],
  ]);
  server = createServer((request, response) => {
    const file = files.get(request.url ?? '');
    if (!file) { response.writeHead(404).end(); return; }
    void readFile(file).then(bytes => {
      response.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : 'text/html' }); response.end(bytes);
    }).catch(() => response.writeHead(500).end());
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/dist/browser/local-first/`;
});
async function stopOrigin() {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); });
}
test.afterEach(stopOrigin);
async function edit(page: Page, text: string) {
  const surface = page.getByRole('textbox', { name: 'Document', exact: true });
  await surface.click();
  await surface.press('ControlOrMeta+A');
  await surface.pressSequentially(text);
}
async function snapshot(page: Page, name: string) {
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Save snapshot', exact: true }).click();
  await expect(page.locator('#after option', { hasText: name })).toHaveCount(1);
}

test('recovers an autosaved draft after offline reload and page replacement', async ({ page, context, browserName }) => {
  await page.goto(url);
  await expect(page.locator('#save-status')).toContainText('Ready.');
  await edit(page, 'Available without a connection');
  await expect(page.locator('#save-status')).toHaveText('Draft saved in this browser.');
  await page.getByRole('button', { name: 'Make available offline' }).click();
  await expect(page.locator('#offline-status')).toHaveText('This page is available offline.');
  // WebKit's offline-emulation flag rejects service-worker navigations upstream:
  // https://github.com/microsoft/playwright/issues/42775
  // Stop the origin in every profile; also use offline emulation where supported.
  await stopOrigin();
  await expect(fetch(url)).rejects.toThrow();
  if (browserName !== 'webkit') await context.setOffline(true);
  const response = await page.reload();
  expect(response?.fromServiceWorker()).toBe(true);
  await expect(page.locator('#save-status')).toHaveText('Draft recovered from this browser.');
  await expect(page.getByRole('textbox', { name: 'Document', exact: true })).toHaveText('Available without a connection');
  await edit(page, 'Changed while offline');
  await expect(page.locator('#save-status')).toHaveText('Draft saved in this browser.');
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto(url);
  await expect(reopened.getByRole('textbox', { name: 'Document', exact: true })).toHaveText('Changed while offline');
});

test('compares snapshots without changing the draft and restores the selected snapshot', async ({ page }) => {
  await page.goto(url);
  await expect(page.locator('#save-status')).toContainText('Ready.');
  await edit(page, 'First'); await snapshot(page, 'Before editing');
  await edit(page, 'Second'); await snapshot(page, 'After editing');
  await page.getByLabel('Earlier', { exact: true }).selectOption({ label: 'Before editing' });
  await page.getByLabel('Later', { exact: true }).selectOption({ label: 'After editing' });
  await page.getByRole('button', { name: 'Compare snapshots' }).click();
  await expect(page.locator('#comparison')).toContainText('"before": "First"');
  await expect(page.locator('#comparison')).toContainText('"after": "Second"');
  await expect(page.getByRole('textbox', { name: 'Document', exact: true })).toHaveText('Second');
  await page.getByLabel('Later', { exact: true }).selectOption({ label: 'Before editing' });
  await page.getByRole('button', { name: 'Restore later snapshot' }).click();
  await expect(page.locator('#snapshot-status')).toContainText('Snapshot restored');
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Document', exact: true })).toHaveText('First');
});

for (const failure of ['quota', 'abort'] as const) {
  test(`retains the last saved draft and can retry after a ${failure} write failure`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    await expect(page.locator('#save-status')).toContainText('Ready.');
    await edit(page, 'Last successful save');
    await expect(page.locator('#save-status')).toHaveText('Draft saved in this browser.');
    await page.evaluate(mode => {
      const original = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) {
        if (this.name !== 'documents') return original.apply(this, args);
        IDBObjectStore.prototype.put = original;
        if (mode === 'quota') throw new DOMException('Injected storage quota failure', 'QuotaExceededError');
        const request = original.apply(this, args); this.transaction.abort(); return request;
      };
    }, failure);
    await edit(page, 'Retry this draft');
    await expect(page.locator('#save-status')).toContainText('Draft could not be saved');
    const stored = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('art-local-first-example'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      try { return await new Promise<string>((resolve, reject) => {
        const request = db.transaction('documents').objectStore('documents').get('draft');
        request.onsuccess = () => resolve(request.result.document.content[0].content[0].text); request.onerror = () => reject(request.error);
      }); } finally { db.close(); }
    });
    expect(stored).toBe('Last successful save');
    await page.getByRole('button', { name: 'Retry saving' }).click();
    await expect(page.locator('#save-status')).toHaveText('Draft saved in this browser.');
    await page.reload();
    await expect(page.getByRole('textbox', { name: 'Document', exact: true })).toHaveText('Retry this draft');
    expect(errors).toEqual([]);
  });
}

test('rejects incompatible stored data without overwriting it', async ({ page }) => {
  await page.goto(url);
  await expect(page.locator('#save-status')).toContainText('Ready.');
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('art-local-first-example'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('documents', 'readwrite'); tx.objectStore('documents').put({ id: 'draft', updatedAt: 1, document: { type: 'doc', version: 2, content: [] } });
      tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error);
    }); db.close();
  });
  await page.reload();
  await expect(page.locator('#save-status')).toContainText('Stored data has not been overwritten');
  await expect(page.locator('#editor')).toHaveAttribute('disabled', '');
  await page.reload();
  await expect(page.locator('#save-status')).toContainText('Corrupt ART document');
});
