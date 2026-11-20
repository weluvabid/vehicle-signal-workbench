import { test, expect } from '@playwright/test';
import { openWorkspace } from '../support/fixtures';

test('worker startup failure is surfaced and a subsequent generated workload can recover', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    let failNextWorker = true;
    Object.defineProperty(window, 'Worker', {
      configurable: true,
      value: class extends NativeWorker {
        constructor(scriptURL: string | URL, options?: WorkerOptions) {
          if (failNextWorker) {
            failNextWorker = false;
            throw new Error('E2E forced worker startup failure');
          }

          super(scriptURL, options);
        }
      },
    });
  });

  await openWorkspace(page);
  await page.getByRole('button', { name: 'Choose workload' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Generate & ingest' }).click();
  await expect(dialog.getByRole('alert')).toContainText('E2E forced worker startup failure');
  await dialog.getByRole('button', { name: 'Generate & ingest' }).click();
  await expect(dialog).toBeHidden({ timeout: 60_000 });
  await expect(page.getByTestId('signal-chart')).toBeVisible({ timeout: 60_000 });
});
