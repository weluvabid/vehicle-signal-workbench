import { expect, type Page } from '@playwright/test';

export async function openWorkspace(page: Page): Promise<void> {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Explore vehicle measurements at scale.' }),
  ).toBeVisible();
}

export async function generateWorkload(
  page: Page,
  preset = '10',
  timeoutMs = 180_000,
): Promise<void> {
  await page.getByRole('button', { name: 'Choose workload' }).click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('heading', { name: 'Choose a measurement workload' }),
  ).toBeVisible();
  const workload = dialog
    .getByRole('group', { name: 'Dataset size' })
    .getByRole('button', { name: new RegExp(`^${preset} MB$`) });
  await workload.click();
  await dialog.getByRole('button', { name: /Generate & ingest/ }).click();
  await expect(dialog).toBeHidden({ timeout: timeoutMs });
  await expect(page.getByTestId('comparison-results')).toBeVisible({ timeout: timeoutMs });
  await expect(page.getByTestId('signal-chart').first()).toBeVisible({ timeout: timeoutMs });
}
