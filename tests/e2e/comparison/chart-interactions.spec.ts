import { test, expect } from '@playwright/test';
import { importPair, openWorkspace } from '../support/fixtures';

test('rapid zoom and pan interactions keep chart and worker-backed statistics coherent', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openWorkspace(page);
  await importPair(page, '01-basic-comparison');

  const chart = page.getByTestId('signal-chart');
  const canvas = chart.locator('canvas').first();
  await expect(canvas).toBeVisible();
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  if (!bounds) return;

  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 3;
  await page.mouse.move(x, y);
  for (let index = 0; index < 5; index += 1) {
    await page.mouse.wheel(0, index % 2 === 0 ? -240 : 180);
  }
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 120, y + 5, { steps: 8 });
  await page.mouse.up();

  await expect(chart).toBeVisible();
  await expect(page.locator('.signal-statistics-range')).toBeVisible();
  await expect(page.getByText('Viewport ready')).toBeVisible();
  expect(errors).toEqual([]);
});

test('switches between overlay, tabular samples and statistics views', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openWorkspace(page);
  await importPair(page, '01-basic-comparison');

  const chart = page.getByTestId('signal-chart');
  await expect(chart).toHaveAttribute('aria-label', /Synchronized comparison of 3 signals in overlay mode/);
  await expect(chart.locator('canvas')).toBeVisible();
  const speedVisibility = page.getByRole('checkbox', { name: 'Show Vehicle Speed' });
  await expect(speedVisibility).toBeVisible();
  await expect(page.getByRole('region', { name: 'Visible signals' })).toHaveCount(0);
  await speedVisibility.uncheck();
  await expect(speedVisibility).not.toBeChecked();
  await speedVisibility.check();
  await expect(speedVisibility).toBeChecked();
  await page.getByRole('button', { name: /Engine RPM/ }).click();

  await page.getByRole('tab', { name: 'Tabular data' }).click();
  await expect(page.getByRole('heading', { name: 'Engine RPM' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Δ (Ref − Comp)' })).toBeVisible();
  await expect(page.getByText(/displayed viewport points/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Rows per page' })).toHaveText('25');
  await page.getByRole('combobox', { name: 'Rows per page' }).click();
  await page.getByRole('option', { name: '50' }).click();
  await expect(page.getByRole('combobox', { name: 'Rows per page' })).toHaveText('50');
  await expect(page.locator('[data-testid=tabular-data-scroll] thead')).toHaveClass(/sticky/);

  await page.getByRole('tab', { name: 'Statistics' }).click();
  await expect(page.locator('.signal-statistics')).toHaveCount(3);
  await expect(page.locator('.signal-difference-summary').first()).toContainText('RMSE');

  await page.getByRole('tab', { name: 'Overlay' }).click();
  await expect(chart).toBeVisible();
  expect(errors).toEqual([]);
});
