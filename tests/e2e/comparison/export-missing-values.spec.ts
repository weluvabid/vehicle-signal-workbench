import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { importPair, openWorkspace } from '../support/fixtures';

test('CSV export preserves missing measurements as empty cells, never zero', async ({ page }) => {
  await openWorkspace(page);
  await importPair(page, '09-missing-values');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export visible CSV' }).click();
  const download = await downloadPromise;
  const filePath = await download.path();
  expect(filePath).not.toBeNull();
  const csv = await readFile(filePath!, 'utf8');
  const firstDataRow = csv.replace(/^\uFEFF/, '').split(/\r?\n/)[1];
  expect(firstDataRow).toMatch(/,"0","","","","false"$/);
});
