import { test, expect } from '@playwright/test';
import { generateWorkload, openWorkspace } from '../support/fixtures';

test('complete generated comparison workflow: generate, inspect and navigate', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await openWorkspace(page);
  await generateWorkload(page);

  const chart = page.getByTestId('signal-chart').first();
  await expect(chart).toBeVisible();
  await expect(chart.locator('canvas').first()).toBeVisible();

  const bounds = await chart.locator('canvas').first().boundingBox();
  expect(bounds).not.toBeNull();

  if (bounds) {
    const x = bounds.x + bounds.width * 0.55;
    const y = bounds.y + bounds.height * 0.42;
    await page.mouse.move(x, y);
    await page.mouse.wheel(0, -420);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 80, y, { steps: 5 });
    await page.mouse.up();
  }

  await expect(chart).toBeVisible();
  await expect(page.getByText('Channel analysis')).toBeVisible();
  await expect(page.getByText('Current interval')).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('chart resize and workspace teardown do not produce browser exceptions', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openWorkspace(page);
  await generateWorkload(page);

  const chart = page.getByTestId('signal-chart').first();
  const canvas = chart.locator('canvas').first();

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 960 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(chart).toBeVisible();
    await expect
      .poll(async () => {
        const hostContentSize = await chart.evaluate((element) => ({
          width: element.clientWidth,
          height: element.clientHeight,
        }));
        const canvasBounds = await canvas.boundingBox();

        if (!canvasBounds) return Number.POSITIVE_INFINITY;

        return (
          Math.abs(hostContentSize.width - canvasBounds.width) +
          Math.abs(hostContentSize.height - canvasBounds.height)
        );
      })
      .toBeLessThan(2);
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  }

  await page.goto('about:blank');
  expect(errors).toEqual([]);
});
