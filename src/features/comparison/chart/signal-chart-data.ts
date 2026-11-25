import type { SignalChartPanel } from '@/features/comparison/chart/signal-chart-types';
import type uPlot from 'uplot';

function sampleValue(points: SignalChartPanel['reference'], target: number): number | null {
  let low = 0;
  let high = points.length;

  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);

    if (points[middle][0] < target) low = middle + 1;
    else high = middle;
  }

  const right = points[low];

  if (right && right[0] === target)
    return right[1] !== null && Number.isFinite(right[1]) ? right[1] : null;

  const left = points[low - 1];

  if (!left || !right || left[1] === null || right[1] === null) return null;

  if (!Number.isFinite(left[1]) || !Number.isFinite(right[1])) return null;

  const span = right[0] - left[0];

  if (!(span > 0)) return null;

  return left[1] + (right[1] - left[1]) * ((target - left[0]) / span);
}

/** Aligns both sorted signal series to one X domain while preserving missing-value gaps. */
export function buildSignalPanelData(panel: SignalChartPanel): uPlot.AlignedData {
  const times = new Set<number>();

  for (const [time] of panel.reference) if (Number.isFinite(time)) times.add(time);

  for (const [time] of panel.comparison) if (Number.isFinite(time)) times.add(time);

  const x = [...times].sort((left, right) => left - right);
  return [
    x,
    x.map((time) => sampleValue(panel.reference, time)),
    x.map((time) => sampleValue(panel.comparison, time)),
  ];
}
