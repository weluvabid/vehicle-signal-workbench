import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildUPlotSeriesData } from './uplot-data';
import type { SignalChartPanel } from '@/components/comparison/signal-chart-types';

const panel = (reference: [number, number | null][], comparison: [number, number | null][]) =>
  ({
    id: 'speed',
    label: 'Speed',
    unit: 'km/h',
    color: '#60a5fa',
    reference,
    comparison,
    visible: true,
  }) satisfies SignalChartPanel;

describe('buildUPlotSeriesData', () => {
  it('aligns independent timestamps and normalizes both drives against one range', () => {
    const result = buildUPlotSeriesData([
      panel([[0, 0], [2, 20]], [[1, 10], [2, 30]]),
    ]);
    assert.deepEqual(result.x, [0, 1, 2]);
    assert.deepEqual(result.series[0], [0, 33.33333333333333, 66.66666666666666]);
    assert.deepEqual(result.series[1], [33.33333333333333, 33.33333333333333, 100]);
  });

  it('maps constant signals to the midpoint and preserves missing values', () => {
    const result = buildUPlotSeriesData([panel([[0, 7], [1, null]], [[0, 7], [1, 7]])]);
    assert.deepEqual(result.series[0], [50, null]);
    assert.deepEqual(result.series[1], [50, 50]);
  });

  it('does not interpolate across null gaps', () => {
    const result = buildUPlotSeriesData([panel([[0, 0], [1, null], [2, 10]], [[0, 0], [2, 10]])]);
    assert.deepEqual(result.series[0], [0, null, 100]);
  });

  it('returns an empty aligned data set for empty panels', () => {
    assert.deepEqual(buildUPlotSeriesData([]), { x: [], series: [], ranges: [] });
  });
});
