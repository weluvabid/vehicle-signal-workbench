import assert from 'node:assert/strict';
import test from 'node:test';
import { formatChartNumber, formatMeasurementNumber } from './number-format.ts';

test('formats finite measurements and normalizes negative zero', () => {
  assert.equal(formatMeasurementNumber(12.34567), '12.3457');
  assert.equal(formatMeasurementNumber(-0), '0');
  assert.equal(formatMeasurementNumber(null), '—');
});

test('uses scientific notation for extreme chart values', () => {
  assert.match(formatChartNumber(1e12), /E/i);
  assert.equal(formatChartNumber(12.5), '12.5');
  assert.equal(formatChartNumber(Number.NaN), '—');
});
