import assert from 'node:assert/strict';
import test from 'node:test';
import { formatMeasurementValue } from './formatting.ts';

test('formats negative zero as canonical zero', () => {
  assert.equal(formatMeasurementValue(-0), formatMeasurementValue(0));
  assert.doesNotMatch(formatMeasurementValue(-0), /^-/);
});

test('preserves missing values and ordinary negative measurements', () => {
  assert.equal(formatMeasurementValue(null), '—');
  assert.match(formatMeasurementValue(-1.25), /^-/);
});
