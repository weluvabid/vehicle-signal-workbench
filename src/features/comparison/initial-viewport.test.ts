import assert from 'node:assert/strict';
import test from 'node:test';
import { getInitialVisibleFraction } from './initial-viewport.ts';

test('initial visible fraction scales with dataset size', () => {
  assert.equal(getInitialVisibleFraction(10_000_000), 0.05);
  assert.ok(Math.abs(getInitialVisibleFraction(1_000_000) - 0.1) < 0.001);
  assert.equal(getInitialVisibleFraction(250_000), 1);
  assert.equal(getInitialVisibleFraction(100_000), 1);
});
