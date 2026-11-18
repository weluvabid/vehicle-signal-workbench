import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateTimelineOverlap } from './alignment.ts';

test('computes overlap when comparison starts later', () => {
  assert.deepEqual(calculateTimelineOverlap(100, 80, 20), {
    startSeconds: 20, endSeconds: 100, durationSeconds: 80,
  });
});

test('computes overlap when comparison starts earlier', () => {
  assert.deepEqual(calculateTimelineOverlap(100, 80, -20), {
    startSeconds: 0, endSeconds: 60, durationSeconds: 60,
  });
});

test('returns an empty interval for disjoint runs', () => {
  assert.deepEqual(calculateTimelineOverlap(10, 5, 20), {
    startSeconds: 10, endSeconds: 10, durationSeconds: 0,
  });
});

test('handles touching boundaries as zero overlap', () => {
  assert.deepEqual(calculateTimelineOverlap(10, 5, -5), {
    startSeconds: 0, endSeconds: 0, durationSeconds: 0,
  });
});

test('rejects non-finite offsets and invalid durations', () => {
  assert.throws(() => calculateTimelineOverlap(10, 5, Number.NaN), RangeError);
  assert.throws(() => calculateTimelineOverlap(-1, 5, 0), RangeError);
});
