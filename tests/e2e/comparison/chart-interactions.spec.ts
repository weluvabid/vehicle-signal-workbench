import { test, expect } from '@playwright/test';
import { generateWorkload, openWorkspace } from '../support/fixtures';

test('rapid zoom and pan interactions keep chart and worker-backed statistics coherent', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openWorkspace(page);
  await generateWorkload(page);

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
  await expect(page.getByRole('heading', { name: 'Channel analysis' })).toBeVisible();
  await expect(page.getByText('Current interval', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('chart remains interactive after a generated workload is loaded', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openWorkspace(page);
  await generateWorkload(page);

  const chart = page.getByTestId('signal-chart');
  await expect(chart).toBeVisible();
  const canvas = chart.locator('canvas').first();
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();

  if (!bounds) return;

  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.wheel(0, -240);
  await page.getByRole('button', { name: 'Reset zoom' }).click();
  await expect(chart).toBeVisible();
  expect(errors).toEqual([]);
});
