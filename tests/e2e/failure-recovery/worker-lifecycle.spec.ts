import { test, expect } from '@playwright/test';
import {
  fixturePath,
  importRun,
  openWorkspace,
} from '../support/fixtures';

test('worker startup failure is surfaced and a subsequent worker can recover', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    let crashNextWorker = true;
    Object.defineProperty(window, 'Worker', {
      configurable: true,
      value: class extends NativeWorker {
        constructor(scriptURL: string | URL, options?: WorkerOptions) {
          super(scriptURL, options);
          if (crashNextWorker) {
            crashNextWorker = false;
            window.setTimeout(() => {
              this.dispatchEvent(new ErrorEvent('error', { message: 'E2E forced worker crash' }));
            }, 20);
          }
        }
      },
    });
  });

  await openWorkspace(page);
  const panel = page.getByTestId('reference-import-panel');
  await panel.getByTestId('reference-file-input').setInputFiles(fixturePath('01-basic-comparison', 'reference.csv'));
  await panel.getByLabel('Timestamp column').click();
  await page.getByRole('option', { name: 'Timestamp', exact: true }).click();
  await panel.getByLabel('Timestamp format').click();
  await page.getByRole('option', { name: 'Unix timestamp (seconds)' }).click();
  await panel.getByRole('button', { name: 'Import run' }).click();
  await expect(panel.getByRole('alert')).toContainText('E2E forced worker crash');

  await panel.getByRole('button', { name: 'Import run' }).click();
  await expect(page.getByTestId('reference-dataset-summary')).toBeVisible({ timeout: 60_000 });
});

test('a failed import can be corrected and retried in the same slot', async ({ page }) => {
  await openWorkspace(page);
  const panel = page.getByTestId('reference-import-panel');
  await panel.getByTestId('reference-file-input').setInputFiles(fixturePath('07-duplicate-timestamps', 'reference.csv'));
  await panel.getByLabel('Timestamp column').click();
  await page.getByRole('option', { name: 'Timestamp', exact: true }).click();
  await panel.getByLabel('Timestamp format').click();
  await page.getByRole('option', { name: 'Unix timestamp (seconds)' }).click();
  await panel.getByRole('button', { name: 'Import run' }).click();
  await expect(panel.getByRole('alert')).toContainText('NON_MONOTONIC_TIMESTAMP');

  await panel.getByTestId('reference-file-input').setInputFiles(fixturePath('01-basic-comparison', 'reference.csv'));
  await panel.getByLabel('Timestamp column').click();
  await page.getByRole('option', { name: 'Timestamp', exact: true }).click();
  await panel.getByLabel('Timestamp format').click();
  await page.getByRole('option', { name: 'Unix timestamp (seconds)' }).click();
  await panel.getByRole('button', { name: 'Import run' }).click();
  await expect(page.getByTestId('reference-dataset-summary')).toBeVisible({ timeout: 60_000 });
  await expect(panel.getByRole('alert')).toHaveCount(0);
});

test('an offset that removes overlap removes comparison visualizations', async ({ page }) => {
  await openWorkspace(page);
  await importRun(page, 'reference', fixturePath('01-basic-comparison', 'reference.csv'));
  await importRun(page, 'comparison', fixturePath('01-basic-comparison', 'comparison.csv'));
  await expect(page.getByTestId('signal-chart')).toBeVisible();
  await page.getByRole('button', { name: /Workspace controls/ }).click();
  await page.getByTestId('comparison-offset').fill('100');
  await expect(page.getByTestId('overlap-summary')).toContainText('These runs do not share a time interval');
  await expect(page.getByTestId('plot-workspace')).toHaveCount(0);
});

test('rejects a dataset whose non-timestamp columns contain no numeric measurements', async ({ page }) => {
  await openWorkspace(page);
  const panel = page.getByTestId('reference-import-panel');
  await panel.getByTestId('reference-file-input').setInputFiles({
    name: 'no-numeric-channels.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Timestamp,Operating Mode,ECU Label\n1700000000,IDLE,ECU-A\n1700000001,LOAD,ECU-A\n'),
  });
  await panel.getByLabel('Timestamp column').click();
  await page.getByRole('option', { name: 'Timestamp', exact: true }).click();
  await panel.getByLabel('Timestamp format').click();
  await page.getByRole('option', { name: 'Unix timestamp (seconds)' }).click();
  await panel.getByRole('button', { name: 'Import run' }).click();
  await expect(panel.getByRole('alert')).toContainText('NO_NUMERIC_CHANNELS');
});

test('rejects duplicate CSV headers after trimming whitespace', async ({ page }) => {
  await openWorkspace(page);
  const panel = page.getByTestId('reference-import-panel');
  await panel.getByTestId('reference-file-input').setInputFiles({
    name: 'duplicate-headers.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Timestamp,Speed [km/h], Speed [km/h]\n1700000000,1,2\n1700000001,2,3\n'),
  });
  await panel.getByLabel('Timestamp column').click();
  await page.getByRole('option', { name: 'Timestamp', exact: true }).click();
  await panel.getByLabel('Timestamp format').click();
  await page.getByRole('option', { name: 'Unix timestamp (seconds)' }).click();
  await panel.getByRole('button', { name: 'Import run' }).click();
  await expect(panel.getByRole('alert')).toContainText('INVALID_CSV');
  await expect(panel.getByRole('alert')).toContainText('headers must be unique');
});
