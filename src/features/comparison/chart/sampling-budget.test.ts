import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSamplingPixelWidth } from './sampling-budget.ts';

test('sampling budget stays within a small bounded range', () => {
  assert.equal(resolveSamplingPixelWidth(Number.NaN), 5);
  assert.equal(resolveSamplingPixelWidth(0), 5);
  assert.equal(resolveSamplingPixelWidth(768), 5);
  assert.equal(resolveSamplingPixelWidth(1_440), 5);
  assert.equal(resolveSamplingPixelWidth(1_441), 6);
  assert.equal(resolveSamplingPixelWidth(1_920), 6);
  assert.equal(resolveSamplingPixelWidth(1_921), 8);
  assert.equal(resolveSamplingPixelWidth(3_840), 8);
});
