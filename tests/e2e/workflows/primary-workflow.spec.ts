import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import {
  fixturePath,
  importPair,
  openWorkspace,
} from '../support/fixtures';

test('complete comparison workflow: import, map, inspect, navigate and export', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await openWorkspace(page);
  await importPair(page, '01-basic-comparison');

  await expect(page.getByText('3/3 compatible')).toBeVisible();
  await expect(page.getByTestId('signal-chart')).toBeVisible();
  await expect(page.locator('.signal-statistics')).toHaveCount(3);
  await expect(page.locator('.signal-difference-summary').first()).toContainText('Matched');

  const chart = page.getByTestId('signal-chart');
  const canvas = chart.locator('canvas').first();
  await expect(canvas).toBeVisible();
  const bounds = await canvas.boundingBox();
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
  await expect(page.locator('.signal-statistics-range')).toBeVisible();

  const exportButton = page.getByRole('button', { name: 'Export visible CSV' });
  await expect(exportButton).toBeEnabled();
  const downloadPromise = page.waitForEvent('download');
  await exportButton.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^vsw-comparison-.*\.csv$/);
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  if (downloadPath === null) throw new Error('Playwright did not provide a download path.');
  const csv = await readFile(downloadPath, 'utf8');
  expect(csv).toContain('channel,unit,reference_time_seconds,reference_value,comparison_interpolated_value,delta_reference_minus_comparison,matched');
  expect(csv).toContain('Vehicle Speed');
  expect(csv.split(/\r?\n/).length).toBeGreaterThan(10);

  // Removing a selected signal must remove its reference, comparison and delta panels together.
  await page.getByRole('button', { name: /Workspace controls/ }).click();
  await page.getByRole('tab', { name: 'Channels' }).click();
  const signals = page.getByRole('checkbox');
  await expect(signals).toHaveCount(3);
  await signals.nth(0).click();
  await page.getByRole('button', { name: /Workspace controls/ }).click();
  await expect(page.getByRole('group', { name: /Synchronized comparison of 2 signals/ })).toBeVisible();
  await expect(page.locator('.signal-statistics')).toHaveCount(2);

  expect(pageErrors).toEqual([]);
});

test('imports both runs concurrently without cross-contaminating their descriptors', async ({ page }) => {
  await openWorkspace(page);
  const referencePanel = page.getByTestId('reference-import-panel');
  const comparisonPanel = page.getByTestId('comparison-import-panel');

  await Promise.all([
    referencePanel.getByTestId('reference-file-input').setInputFiles(fixturePath('01-basic-comparison', 'reference.csv')),
    comparisonPanel.getByTestId('comparison-file-input').setInputFiles(fixturePath('02-different-sampling-rates', 'comparison.csv')),
  ]);
  await Promise.all([
    expect(referencePanel.getByLabel('Timestamp column')).toBeVisible(),
    expect(comparisonPanel.getByLabel('Timestamp column')).toBeVisible(),
  ]);
  await referencePanel.getByLabel('Timestamp column').click();
  await page.getByRole('option', { name: 'Timestamp', exact: true }).click();
  await comparisonPanel.getByLabel('Timestamp column').click();
  await page.getByRole('option', { name: 'Timestamp', exact: true }).click();
  await referencePanel.getByLabel('Timestamp format').click();
  await page.getByRole('option', { name: 'Unix timestamp (seconds)' }).click();
  await comparisonPanel.getByLabel('Timestamp format').click();
  await page.getByRole('option', { name: 'Unix timestamp (seconds)' }).click();
  // Start both operations without awaiting either import. UI actions on the
  // same Playwright page are deliberately sequential; Promise.all(click, click)
  // races the browser input dispatch and can drop one of the clicks.
  await referencePanel.getByRole('button', { name: 'Import run' }).click();
  await comparisonPanel.getByRole('button', { name: 'Import run' }).click();
  await Promise.all([
    expect(page.getByTestId('reference-dataset-summary')).toBeVisible({ timeout: 60_000 }),
    expect(page.getByTestId('comparison-dataset-summary')).toBeVisible({ timeout: 60_000 }),
  ]);
  await expect(page.getByText('3/3 compatible')).toBeVisible();
});

test('replacing a run releases the old descriptor and renders the replacement', async ({ page }) => {
  await openWorkspace(page);
  await importPair(page, '01-basic-comparison');
  await expect(page.getByTestId('reference-dataset-summary')).toBeVisible();

  await page.getByRole('button', { name: /Workspace controls/ }).click();
  const panel = page.getByTestId('reference-import-panel');
  await panel.getByTestId('reference-file-input').setInputFiles({
    name: 'replacement-run.csv',
    mimeType: 'text/csv',
    buffer: await readFile(fixturePath('02-different-sampling-rates', 'reference.csv')),
  });
  await expect(page.getByTestId('reference-dataset-summary')).toHaveCount(0);
  await panel.getByLabel('Timestamp column').click();
  await page.getByRole('option', { name: 'Timestamp', exact: true }).click();
  await panel.getByLabel('Timestamp format').click();
  await page.getByRole('option', { name: 'Unix timestamp (seconds)' }).click();
  await panel.getByRole('button', { name: 'Import run' }).click();
  await expect(page.getByTestId('reference-dataset-summary')).toContainText('replacement-run');
  await expect(page.getByTestId('signal-chart')).toBeVisible();
});


test('replacing the comparison run updates the workspace without retaining stale channel mappings', async ({ page }) => {
  await openWorkspace(page);
  await importPair(page, '01-basic-comparison');
  await expect(page.getByText('3/3 compatible')).toBeVisible();

  await page.getByRole('button', { name: /Workspace controls/ }).click();
  const panel = page.getByTestId('comparison-import-panel');
  await panel.getByTestId('comparison-file-input').setInputFiles({
    name: 'replacement-candidate.csv',
    mimeType: 'text/csv',
    buffer: await readFile(fixturePath('02-different-sampling-rates', 'comparison.csv')),
  });
  await expect(page.getByTestId('comparison-dataset-summary')).toHaveCount(0);
  await panel.getByLabel('Timestamp column').click();
  await page.getByRole('option', { name: 'Timestamp', exact: true }).click();
  await panel.getByLabel('Timestamp format').click();
  await page.getByRole('option', { name: 'Unix timestamp (seconds)' }).click();
  await panel.getByRole('button', { name: 'Import run' }).click();
  await expect(page.getByTestId('comparison-dataset-summary')).toContainText('replacement-candidate');
  await expect(page.getByText('3/3 compatible')).toBeVisible();
  await expect(page.getByTestId('signal-chart')).toBeVisible();
});

test('chart resize and workspace teardown do not produce browser exceptions', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openWorkspace(page);
  await importPair(page, '01-basic-comparison');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId('signal-chart')).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 960 });
  await expect(page.getByTestId('signal-chart')).toBeVisible();
  await page.goto('about:blank');
  expect(errors).toEqual([]);
});
