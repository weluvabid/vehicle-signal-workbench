import { test, expect } from '@playwright/test';
import { generateWorkload, openWorkspace } from './support/fixtures';

test('landing page opens the generated-workload wizard', async ({ page }) => {
  await openWorkspace(page);
  await page.getByRole('button', { name: 'Choose workload' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Choose a measurement workload' })).toBeVisible();
  await expect(dialog.getByRole('group', { name: 'Dataset size' }).getByRole('button')).toHaveCount(8);
  await expect(dialog.getByText('Generated in browser')).toBeVisible();
  await expect(dialog.getByText('Worker-based ingestion')).toBeVisible();
  await expect(dialog.getByText('No upload or backend')).toBeVisible();
});

test('generated recordings produce a synchronized comparison and channel analysis', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openWorkspace(page);
  await generateWorkload(page);
  await expect(page.getByTestId('signal-chart').locator('canvas').first()).toBeVisible();
  await expect(page.getByRole('region', { name: 'Synchronized signal charts' })).toBeVisible();
  await expect(page.getByText('Channel analysis')).toBeVisible();
  expect(errors).toEqual([]);
});

test('N opens a fresh workload wizard from the results view', async ({ page }) => {
  await openWorkspace(page);
  await generateWorkload(page);
  await page.keyboard.press('n');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Choose a measurement workload' })).toBeVisible();
});
