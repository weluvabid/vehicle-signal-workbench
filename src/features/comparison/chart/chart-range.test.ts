import assert from 'node:assert/strict';
import test from 'node:test';
import { clampChartRange } from './chart-range.ts';

test('clamps viewport bounds while preserving its span', () => {
  assert.deepEqual(clampChartRange(-10, 20, 0, 100), { min: 0, max: 30 });
  assert.deepEqual(clampChartRange(90, 120, 0, 100), { min: 70, max: 100 });
});

test('bounds viewport span to the available domain', () => {
  assert.deepEqual(clampChartRange(-100, 200, 0, 100), { min: 0, max: 100 });
});
