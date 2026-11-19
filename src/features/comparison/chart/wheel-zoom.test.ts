import assert from 'node:assert/strict';
import test from 'node:test';
import { getWheelZoomRange } from './wheel-zoom.ts';

test('wheel zoom contracts the visible range around the pointer', () => {
  const range = getWheelZoomRange({ start: 20, end: 80 }, -100, 0.25);
  assert.ok(range);
  assert.ok(range.end - range.start < 60);
  const oldAnchor = 20 + 60 * 0.25;
  const newAnchor = range.start + (range.end - range.start) * 0.25;
  assert.ok(Math.abs(oldAnchor - newAnchor) < 1e-9);
});

test('wheel zoom expands the visible range without exceeding the domain', () => {
  const range = getWheelZoomRange({ start: 10, end: 90 }, 1_000, 0.5);
  assert.deepEqual(range, { start: 0, end: 100 });
});

test('wheel zoom respects the minimum visible span', () => {
  const range = getWheelZoomRange({ start: 49.9, end: 50.1 }, -1_000, 0.5, 0.1);
  assert.ok(range);
  assert.ok(range.end - range.start >= 0.1);
});
