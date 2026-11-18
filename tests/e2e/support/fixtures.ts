import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export type RunRole = 'reference' | 'comparison';
export type TimestampEncoding = 'iso-8601' | 'unix-seconds' | 'unix-milliseconds';

export const fixtureRoot = path.resolve(process.cwd(), 'tests/fixtures');

export function fixturePath(scenario: string, fileName: string): string {
  return path.join(fixtureRoot, scenario, fileName);
}

export function readExpected<T = Record<string, unknown>>(scenario: string): T {
  return JSON.parse(readFileSync(fixturePath(scenario, 'expected.json'), 'utf8')) as T;
}

export async function openWorkspace(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Compare vehicle runs' })).toBeVisible();
  await page.getByRole('button', { name: /Configure measurement runs/ }).click();
}

export async function selectCsv(
  page: Page,
  role: RunRole,
  file: string,
  encoding: TimestampEncoding = 'unix-seconds',
): Promise<void> {
  const panel = page.getByTestId(`${role}-import-panel`);
  await panel.getByTestId(`${role}-file-input`).setInputFiles(file);
  await expect(panel.getByLabel('Timestamp column')).toBeVisible();
  await panel.getByLabel('Timestamp column').click();
  await page.getByRole('option', { name: 'Timestamp', exact: true }).click();
  await panel.getByLabel('Timestamp format').click();
  await page.getByRole('option', { name: encoding === 'unix-seconds' ? 'Unix timestamp (seconds)' : encoding === 'unix-milliseconds' ? 'Unix timestamp (milliseconds)' : 'ISO 8601 date/time' }).click();
}

export async function importSelectedCsv(page: Page, role: RunRole): Promise<void> {
  const panel = page.getByTestId(`${role}-import-panel`);
  await panel.getByRole('button', { name: /Import run|Re-import run/ }).click();
}

export async function importRun(
  page: Page,
  role: RunRole,
  file: string,
  encoding: TimestampEncoding = 'unix-seconds',
  timeoutMs = 60_000,
): Promise<void> {
  await selectCsv(page, role, file, encoding);
  await importSelectedCsv(page, role);
  await expect(page.getByTestId(`${role}-dataset-summary`)).toBeVisible({ timeout: timeoutMs });
}

export async function expectImportFailure(
  page: Page,
  role: RunRole,
  file: string,
  code: string,
  encoding: TimestampEncoding = 'unix-seconds',
): Promise<void> {
  const panel = page.getByTestId(`${role}-import-panel`);
  await selectCsv(page, role, file, encoding);
  await importSelectedCsv(page, role);
  await expect(panel.getByRole('alert')).toContainText(code, { timeout: 30_000 });
  await expect(page.getByTestId(`${role}-dataset-summary`)).toHaveCount(0);
}

export async function importPair(
  page: Page,
  scenario: string,
  encoding: TimestampEncoding = 'unix-seconds',
): Promise<void> {
  await importRun(page, 'reference', fixturePath(scenario, 'reference.csv'), encoding);
  await importRun(page, 'comparison', fixturePath(scenario, 'comparison.csv'), encoding);
  await page.getByRole('button', { name: /Workspace controls/ }).click();
}
