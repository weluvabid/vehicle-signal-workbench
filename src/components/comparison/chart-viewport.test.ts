import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveDataZoomRange } from './chart-viewport.ts';

test('resolves percentage ranges against the complete recording domain', () => {
  assert.deepEqual(resolveDataZoomRange({ start: 25, end: 75 }, 100, 200), {
    startSeconds: 125,
    endSeconds: 175,
  });
});

test('prefers the last complete range in a linked-axis batch', () => {
  assert.deepEqual(resolveDataZoomRange({ batch: [
    { start: 10, end: 90 },
    { start: 20, end: 60 },
    { start: 30 },
  ] }, 0, 1_000), { startSeconds: 200, endSeconds: 600 });
});

test('clamps ranges to the available recording domain', () => {
  assert.deepEqual(resolveDataZoomRange({ startValue: -10, endValue: 120 }, 0, 100), {
    startSeconds: 0,
    endSeconds: 100,
  });
});

test('rejects invalid and empty ranges', () => {
  assert.equal(resolveDataZoomRange({ start: 80, end: 20 }, 0, 100), null);
  assert.equal(resolveDataZoomRange({ start: 'bad', end: 90 }, 0, 100), null);
});
