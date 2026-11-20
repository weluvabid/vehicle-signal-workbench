import test from 'node:test';
import assert from 'node:assert/strict';
import { createTooltipFormatter } from './chart-tooltip.ts';
import type { SignalChartPanel } from './signal-chart-types';

const panel: SignalChartPanel = {
  id: 'speed',
  label: '<Speed>',
  unit: 'km/h',
  color: '#60a5fa',
  visible: true,
  reference: [
    [0, 0],
    [10, 100],
  ],
  comparison: [
    [0, 10],
    [10, 90],
  ],
};

test('tooltip interpolates at the unsnapped pointer time and escapes channel labels', () => {
  const formatter = createTooltipFormatter([panel], () => 5);
  const result = formatter([{ axisValue: 0 }]);
  assert.match(result, /&lt;Speed&gt;/);
  assert.match(result, /Reference: 50/);
  assert.match(result, /Comparison: 50/);
  assert.match(result, /Difference \(Ref − Comp\): 0/);
});

test('tooltip returns an empty string when no finite time is available', () => {
  const formatter = createTooltipFormatter([panel], () => null);
  assert.equal(formatter([]), '');
  assert.equal(formatter([{ axisValue: 'invalid' }]), '');
});
