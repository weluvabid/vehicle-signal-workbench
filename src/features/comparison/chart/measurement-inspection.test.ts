import assert from 'node:assert/strict';
import test from 'node:test';
import { sampleSignalAt } from './measurement-inspection.ts';

test('returns exact samples without interpolation', () => {
  assert.deepEqual(
    sampleSignalAt(
      [
        [0, 10],
        [1, 20],
      ],
      1,
    ),
    {
      value: 20,
      interpolated: false,
    },
  );
});

test('interpolates between adjacent finite samples', () => {
  assert.deepEqual(
    sampleSignalAt(
      [
        [0, 10],
        [2, 30],
      ],
      1,
    ),
    {
      value: 20,
      interpolated: true,
    },
  );
});

test('does not interpolate across missing or non-finite values', () => {
  assert.deepEqual(
    sampleSignalAt(
      [
        [0, 10],
        [2, null],
      ],
      1,
    ),
    {
      value: null,
      interpolated: false,
    },
  );
  assert.deepEqual(
    sampleSignalAt(
      [
        [0, Number.NaN],
        [2, 30],
      ],
      1,
    ),
    {
      value: null,
      interpolated: false,
    },
  );
});
