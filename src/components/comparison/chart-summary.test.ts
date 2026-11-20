import test from 'node:test';
import assert from 'node:assert/strict';
import { getSignalSummary } from './chart-summary.ts';

test('summarizes cursor values and visible-range maximum', () => {
  const result = getSignalSummary(
    [
      [0, 10],
      [1, 20],
      [2, 30],
    ],
    [
      [0, 11],
      [1, 18],
      [2, 35],
    ],
    1,
    0.5,
    1.5,
  );
  assert.deepEqual(result, { current: 18, maximum: 18, difference: 2 });
});

test('does not interpolate across missing samples', () => {
  const result = getSignalSummary(
    [
      [0, 10],
      [1, null],
      [2, 30],
    ],
    [
      [0, 11],
      [1, null],
      [2, 35],
    ],
    1.5,
    0,
    2,
  );
  assert.deepEqual(result, { current: null, maximum: 35, difference: null });
});

test('returns null summary values when no cursor or valid comparison samples exist', () => {
  const result = getSignalSummary([[0, 10]], [[0, null]], null, 0, 1);
  assert.deepEqual(result, { current: null, maximum: null, difference: null });
});
