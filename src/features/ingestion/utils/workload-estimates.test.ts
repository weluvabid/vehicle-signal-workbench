import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateWorkloadEstimates } from './workload-estimates.ts';

test('estimates the two-recording workload without changing the selected preset', () => {
  const preset = { id: '1', label: '1 MB', rows: 25_000, description: 'test' } as const;
  const estimates = calculateWorkloadEstimates(preset);
  assert.equal(estimates.totalRows, 50_000);
  assert.equal(estimates.csvMiB, (25_000 * 40 * 2) / 1_048_576);
  assert.equal(estimates.arrayMiB, (25_000 * 48 * 2) / 1_048_576);
  assert.equal(preset.rows, 25_000);
});
