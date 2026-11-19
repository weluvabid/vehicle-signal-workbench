import assert from 'node:assert/strict';
import test from 'node:test';
import { getInitialViewport, getInitialVisibleFraction } from './initial-viewport';

test('initial visible fraction scales with dataset size', () => {
  assert.equal(getInitialVisibleFraction(10_000_000), 0.05);
  assert.ok(Math.abs(getInitialVisibleFraction(1_000_000) - 0.1) < 0.001);
  assert.equal(getInitialVisibleFraction(250_000), 1);
  assert.equal(getInitialVisibleFraction(100_000), 1);
});

test('initial viewport selects the tail while preserving the full domain', () => {
  assert.deepEqual(getInitialViewport(0, 100, 0.05), { startSeconds: 95, endSeconds: 100 });
  assert.deepEqual(getInitialViewport(10, 110, 0.1), { startSeconds: 100, endSeconds: 110 });
});
