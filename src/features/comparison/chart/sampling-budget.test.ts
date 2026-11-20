import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSamplingPixelWidth } from './sampling-budget.ts';

test('sampling budget stays within a small bounded range', () => {
  assert.equal(resolveSamplingPixelWidth(Number.NaN), 15);
  assert.equal(resolveSamplingPixelWidth(0), 15);
  assert.equal(resolveSamplingPixelWidth(768), 15);
  assert.equal(resolveSamplingPixelWidth(1_440), 15);
  assert.equal(resolveSamplingPixelWidth(1_441), 16);
  assert.equal(resolveSamplingPixelWidth(1_920), 16);
  assert.equal(resolveSamplingPixelWidth(1_921), 18);
  assert.equal(resolveSamplingPixelWidth(3_840), 18);
});
