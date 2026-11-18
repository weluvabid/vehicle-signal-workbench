import { test, expect } from '@playwright/test';
import { fixturePath, importRun, openWorkspace } from './support/fixtures';

const enabled = process.env.VSW_RUN_PERFORMANCE === '1';
const tenMillionEnabled = process.env.VSW_RUN_10M === '1';

test.describe('large-file browser stress tests', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(!enabled, 'Set VSW_RUN_PERFORMANCE=1 to run large-file browser stress tests.');

  test('imports and visualizes two 1M-sample, four-channel runs', async ({ page }) => {
    test.skip(tenMillionEnabled, 'The 10M-only command intentionally skips the 1M run.');
    test.setTimeout(12 * 60 * 1_000);
    await openWorkspace(page);
    const startedAt = performance.now();
    await importRun(page, 'reference', fixturePath('19-large-run-1m', 'reference.csv'), 'unix-seconds', 8 * 60_000);
    await importRun(page, 'comparison', fixturePath('19-large-run-1m', 'comparison.csv'), 'unix-seconds', 8 * 60_000);
    const importDurationMs = performance.now() - startedAt;
    await expect(page.getByTestId('reference-dataset-summary')).toContainText('1,000,000');
    await expect(page.getByTestId('comparison-dataset-summary')).toContainText('1,000,000');
    await page.getByRole('tab', { name: 'Channels' }).click();
    await page.getByRole('checkbox').nth(3).click();
    await page.getByRole('button', { name: /Workspace controls/ }).click();
    await expect(page.getByTestId('signal-chart')).toBeVisible();
    await page.getByRole('tab', { name: 'Statistics' }).click();
    await expect(page.locator('.signal-statistics')).toHaveCount(4);
    const browserMetrics = await page.evaluate(() => {
      const memory = (performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory;
      return {
        userAgent: navigator.userAgent,
        viewport: { width: innerWidth, height: innerHeight },
        usedJSHeapSize: memory?.usedJSHeapSize ?? null,
        totalJSHeapSize: memory?.totalJSHeapSize ?? null,
      };
    });
    await test.info().attach('1m-browser-metrics.json', {
      body: Buffer.from(JSON.stringify({ importDurationMs, ...browserMetrics }, null, 2)),
      contentType: 'application/json',
    });
  });

  test('imports and visualizes two 10M-sample, three-channel runs', async ({ page }) => {
    test.skip(!tenMillionEnabled, 'Set VSW_RUN_10M=1 to run the multi-hundred-MB 10M-sample stress case.');
    test.setTimeout(30 * 60 * 1_000);
    await openWorkspace(page);
    await importRun(page, 'reference', fixturePath('20-high-density-run-10m', 'reference.csv'), 'unix-seconds', 20 * 60_000);
    await importRun(page, 'comparison', fixturePath('20-high-density-run-10m', 'comparison.csv'), 'unix-seconds', 20 * 60_000);
    await expect(page.getByTestId('reference-dataset-summary')).toContainText('10,000,000');
    await expect(page.getByTestId('comparison-dataset-summary')).toContainText('10,000,000');
    await page.getByRole('tab', { name: 'Channels' }).click();
    await page.getByRole('button', { name: /Workspace controls/ }).click();
    await expect(page.getByTestId('signal-chart')).toBeVisible();
    await page.getByRole('tab', { name: 'Statistics' }).click();
    await expect(page.locator('.signal-statistics')).toHaveCount(3);
    const browserMetrics = await page.evaluate(() => {
      const memory = (performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory;
      return {
        userAgent: navigator.userAgent,
        viewport: { width: innerWidth, height: innerHeight },
        usedJSHeapSize: memory?.usedJSHeapSize ?? null,
        totalJSHeapSize: memory?.totalJSHeapSize ?? null,
      };
    });
    await test.info().attach('10m-browser-metrics.json', {
      body: Buffer.from(JSON.stringify(browserMetrics, null, 2)),
      contentType: 'application/json',
    });
  });
});
