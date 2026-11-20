import { test, expect } from '@playwright/test';
import { generateWorkload, openWorkspace } from './support/fixtures';

const enabled = process.env.VSW_RUN_PERFORMANCE === '1';
const tenMillionEnabled = process.env.VSW_RUN_10M === '1';

async function attachBrowserMetrics(page: import('@playwright/test').Page, name: string, ingestionStartedAt: number) {
  const browserMetrics = await page.evaluate(() => {
    const memory = (performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory;
    return {
      userAgent: navigator.userAgent,
      viewport: { width: innerWidth, height: innerHeight },
      usedJSHeapSize: memory?.usedJSHeapSize ?? null,
      totalJSHeapSize: memory?.totalJSHeapSize ?? null,
    };
  });
  await test.info().attach(name, {
    body: Buffer.from(JSON.stringify({
      workloadDurationMs: performance.now() - ingestionStartedAt,
      ...browserMetrics,
    }, null, 2)),
    contentType: 'application/json',
  });
}

test.describe('generated-workload browser stress tests', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(!enabled, 'Set VSW_RUN_PERFORMANCE=1 to run large-workload browser stress tests.');

  test('generates and visualizes two 1M-sample, five-channel recordings', async ({ page }) => {
    test.skip(tenMillionEnabled, 'The 10M-only command intentionally skips the 1M run.');
    test.setTimeout(12 * 60 * 1_000);
    await openWorkspace(page);
    const startedAt = performance.now();
    await generateWorkload(page, '40', 8 * 60_000);
    await expect(page.getByTestId('signal-chart')).toBeVisible();
    await expect(page.getByTestId('comparison-results')).toBeVisible();
    await attachBrowserMetrics(page, '1m-generated-workload-browser-metrics.json', startedAt);
  });

  test('generates and visualizes two 10M-sample, five-channel recordings', async ({ page }) => {
    test.skip(!tenMillionEnabled, 'Set VSW_RUN_10M=1 to run the 10M generated-workload stress case.');
    test.setTimeout(30 * 60 * 1_000);
    await openWorkspace(page);
    const startedAt = performance.now();
    await generateWorkload(page, '400', 20 * 60_000);
    await expect(page.getByTestId('signal-chart')).toBeVisible();
    await expect(page.getByTestId('comparison-results')).toBeVisible();
    await attachBrowserMetrics(page, '10m-generated-workload-browser-metrics.json', startedAt);
  });
});
