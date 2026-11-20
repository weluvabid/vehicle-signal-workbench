import assert from 'node:assert/strict';
import test from 'node:test';
import { createPanelSeries } from './chart-series.ts';
import type { SignalChartPanel } from './signal-chart-types';

const panel: SignalChartPanel = {
  id: 'throttle',
  label: 'Throttle Position',
  unit: '%',
  color: '#d6a85f',
  visible: true,
  reference: [
    [0, 10],
    [1, 12],
  ],
  comparison: [
    [0, 11],
    [1, 13],
  ],
};

test('uses pixel-aware min/max sampling and plot clipping for both recordings', () => {
  const [reference, comparison] = createPanelSeries(panel, 0);

  assert.equal(reference.sampling, 'minmax');
  assert.equal(comparison.sampling, 'minmax');
  assert.equal(reference.clip, true);
  assert.equal(comparison.clip, true);
});

test('does not create hidden series when a recording is toggled off', () => {
  const series = createPanelSeries(
    { ...panel, referenceVisible: false, comparisonVisible: true },
    0,
  );

  assert.equal(series.length, 1);
  assert.equal(series[0].id, 'throttle-comparison');
});
