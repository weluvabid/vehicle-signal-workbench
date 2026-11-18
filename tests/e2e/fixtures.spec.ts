import { test, expect } from '@playwright/test';
import {
  expectImportFailure,
  fixturePath,
  importPair,
  importRun,
  openWorkspace,
  readExpected,
  type TimestampEncoding,
} from './support/fixtures';

interface ScenarioExpected {
  readonly import?: { readonly status: 'accepted' | 'rejected'; readonly timestampEncoding?: TimestampEncoding };
  readonly comparison?: {
    readonly comparisonOffsetSeconds?: number;
    readonly expectedOverlapSeconds?: readonly [number, number] | null;
  } | null;
}

const acceptedPairs = [
  ['01-basic-comparison', 'basic identical runs'],
  ['02-different-sampling-rates', 'different sampling rates'],
  ['03-different-start-times', 'different absolute start times with explicit alignment'],
  ['04-partial-overlap', 'partial timeline overlap'],
  ['05-irregular-sampling', 'irregular but monotonic sampling'],
  ['06-no-timeline-overlap', 'disjoint timelines after explicit offset'],
  ['09-missing-values', 'missing measurement values'],
  ['10-long-missing-interval', 'long missing measurement interval'],
  ['11-entirely-empty-channel', 'entirely empty candidate channel is excluded'],
  ['12-extreme-values', 'very large and very small finite values'],
  ['13-different-channel-order', 'channel order differs between runs'],
  ['14-ambiguous-channel-names', 'ambiguous duplicate channel labels'],
  ['15-incompatible-units', 'same label with incompatible units'],
  ['18-metadata-and-mixed-columns', 'numeric signals alongside text metadata'],
] as const;

for (const [scenario, description] of acceptedPairs) {
  test(`fixture ${scenario}: ${description}`, async ({ page }) => {
    await openWorkspace(page);
    await importPair(page, scenario);

    const expected = readExpected<ScenarioExpected>(scenario);
    const offset = expected.comparison?.comparisonOffsetSeconds;
    if (offset !== undefined) {
      await page.getByTestId('comparison-offset').fill(String(offset));
    }

    const overlap = page.getByTestId('overlap-summary');
    await expect(overlap).toBeVisible();
    if (!['06-no-timeline-overlap', '14-ambiguous-channel-names', '15-incompatible-units'].includes(scenario)) {
      await expect(page.getByTestId('signal-chart')).toBeVisible();
    }
    if (expected.comparison?.expectedOverlapSeconds === null) {
      await expect(overlap).toContainText('These runs do not share a time interval');
      await expect(page.getByTestId('plot-workspace')).toHaveCount(0);
    } else if (expected.comparison?.expectedOverlapSeconds) {
      const [start, end] = expected.comparison.expectedOverlapSeconds;
      await expect(overlap).toContainText(`${start.toFixed(3)}–${end.toFixed(3)} s`);
    }

    if (scenario === '01-basic-comparison') {
      await expect(page.getByTestId('signal-chart')).toBeVisible();
      await expect(page.locator('.signal-difference-summary').first()).toContainText('Δ bias 0');
    }
    if (scenario === '09-missing-values' || scenario === '10-long-missing-interval') {
      const statistics = page.locator('.signal-statistics');

      await expect(statistics).toHaveCount(2);
      await expect(statistics.nth(0)).toBeVisible();
      await expect(statistics.nth(1)).toBeVisible();
    }
    if (scenario === '11-entirely-empty-channel') {
      await expect(page.getByTestId('reference-dataset-summary').locator('dd').nth(1)).toHaveText('1');
    }
    if (['13-different-channel-order', '14-ambiguous-channel-names', '15-incompatible-units'].includes(scenario)) {
      await page.getByRole('button', { name: /Workspace controls/ }).click();
      await page.getByRole('tab', { name: 'Channels' }).click();
    }
    if (scenario === '13-different-channel-order') {
      await expect(page.getByText('3/3 compatible')).toBeVisible();
      const speedMapping = page.getByLabel('Map Vehicle Speed to comparison channel');
      await expect(speedMapping).toContainText('Vehicle Speed');
    }
    if (scenario === '14-ambiguous-channel-names') {
      await expect(page.getByText('0/2 compatible')).toBeVisible();
      await expect(page.getByText('Multiple channels share this label').first()).toBeVisible();
    }
    if (scenario === '15-incompatible-units') {
      await expect(page.getByText('Unit mismatch')).toBeVisible();
      await expect(page.getByText('0/1 compatible')).toBeVisible();
    }
  });
}

for (const [scenario, description] of [
  ['07-duplicate-timestamps', 'duplicate timestamps'],
  ['08-out-of-order-timestamps', 'out-of-order timestamps'],
] as const) {
  test(`fixture ${scenario}: rejects ${description}`, async ({ page }) => {
    await openWorkspace(page);
    await expectImportFailure(
      page,
      'reference',
      fixturePath(scenario, 'reference.csv'),
      'NON_MONOTONIC_TIMESTAMP',
    );
  });
}

test('fixture 16: rejects inconsistent row width and malformed quoting', async ({ page }) => {
  await openWorkspace(page);
  await expectImportFailure(
    page,
    'reference',
    fixturePath('16-malformed-csv', 'reference.csv'),
    'INVALID_CSV',
  );
  await expectImportFailure(
    page,
    'comparison',
    fixturePath('16-malformed-csv', 'comparison.csv'),
    'INVALID_CSV',
  );
});

const timestampVariants: readonly { readonly directory: string; readonly encoding: TimestampEncoding }[] = [
  { directory: 'iso-8601', encoding: 'iso-8601' },
  { directory: 'unix-seconds', encoding: 'unix-seconds' },
  { directory: 'unix-milliseconds', encoding: 'unix-milliseconds' },
];

for (const variant of timestampVariants) {
  test(`fixture 17: imports ${variant.encoding} timestamps explicitly`, async ({ page }) => {
    await openWorkspace(page);
    await importRun(page, 'reference', fixturePath(`17-timestamp-encoding-variations/${variant.directory}`, 'reference.csv'), variant.encoding);
    await importRun(page, 'comparison', fixturePath(`17-timestamp-encoding-variations/${variant.directory}`, 'comparison.csv'), variant.encoding);
    await expect(page.getByTestId('overlap-summary')).toContainText('0.000–10.000 s');
  });
}

test('fixture 17: rejects timestamps when the user selects the wrong encoding', async ({ page }) => {
  await openWorkspace(page);
  await expectImportFailure(
    page,
    'reference',
    fixturePath('17-timestamp-encoding-variations/iso-8601', 'reference.csv'),
    'INVALID_TIMESTAMP',
    'unix-seconds',
  );
});
