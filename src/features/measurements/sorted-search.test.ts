import assert from 'node:assert/strict';
import test from 'node:test';
import { lowerBoundFloat64 } from './sorted-search.ts';

test('lowerBoundFloat64 returns the first matching index', () => {
  const values = new Float64Array([1, 2, 2, 2, 5, 9]);
  assert.equal(lowerBoundFloat64(values, 2), 1);
  assert.equal(lowerBoundFloat64(values, 3), 4);
  assert.equal(lowerBoundFloat64(values, 0), 0);
  assert.equal(lowerBoundFloat64(values, 10), values.length);
  assert.equal(lowerBoundFloat64(new Float64Array(), 1), 0);
});
