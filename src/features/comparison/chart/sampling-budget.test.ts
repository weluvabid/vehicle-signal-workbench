import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSamplingPixelWidth } from './sampling-budget';

describe('resolveSamplingPixelWidth', () => {
  it('keeps the worker sampling budget bounded by viewport class', () => {
    assert.equal(resolveSamplingPixelWidth(0), 15);
    assert.equal(resolveSamplingPixelWidth(1440), 15);
    assert.equal(resolveSamplingPixelWidth(1441), 16);
    assert.equal(resolveSamplingPixelWidth(1921), 18);
  });
});
