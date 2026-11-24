import assert from 'node:assert/strict';
import test from 'node:test';
import { createSignalChartOption } from './echarts-options.ts';
import type { SignalChartPanel } from './signal-chart-types';

const panel: SignalChartPanel = {
  id: 'vehicle-speed',
  label: 'Vehicle Speed',
  unit: 'km/h',
  color: '#8b5cf6',
  visible: true,
  reference: [
    [0, 0],
    [1, 10],
  ],
  comparison: [
    [0, 0],
    [1, 11],
  ],
};

test('configures only the horizontal inside zoom and timeline slider', () => {
  const option = createSignalChartOption([panel], 0, 10, 500, 800);
  const dataZoom = Array.isArray(option.dataZoom)
    ? option.dataZoom
    : option.dataZoom
      ? [option.dataZoom]
      : [];

  assert.equal(dataZoom.length, 2);
  assert.deepEqual(
    dataZoom.map((item) => item.id),
    ['viewport-inside', 'viewport-slider'],
  );
  assert.ok(dataZoom.every((item) => !('orient' in item && item.orient === 'vertical')));
});
