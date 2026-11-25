import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSignalPanelData } from './signal-chart-data.ts';
import type { SignalChartPanel } from './signal-chart-types.ts';

const panel: SignalChartPanel = {
  id: 'speed',
  label: 'Vehicle Speed',
  unit: 'km/h',
  color: '#a78bfa',
  reference: [
    [0, 0],
    [2, 20],
  ],
  comparison: [
    [1, 15],
    [2, null],
  ],
};

test('aligns both series to the sorted union of timestamps', () => {
  assert.deepEqual(buildSignalPanelData(panel), [
    [0, 1, 2],
    [0, 10, 20],
    [null, 15, null],
  ]);
});

test('preserves non-finite measurements as chart gaps', () => {
  const data = buildSignalPanelData({
    ...panel,
    reference: [
      [0, 1],
      [1, Number.NaN],
      [2, 3],
    ],
    comparison: [
      [0, Number.POSITIVE_INFINITY],
      [1, Number.POSITIVE_INFINITY],
      [2, Number.POSITIVE_INFINITY],
    ],
  });

  assert.deepEqual(data, [
    [0, 1, 2],
    [1, null, 3],
    [null, null, null],
  ]);
});
