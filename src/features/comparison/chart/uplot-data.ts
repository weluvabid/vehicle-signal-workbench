import type { SignalPoint } from '@/features/measurements/plot-data';
import type { SignalChartPanel } from '@/components/comparison/signal-chart-types';

export interface UPlotSeriesData {
  readonly x: number[];
  readonly series: readonly (number | null)[][];
  readonly ranges: readonly { readonly min: number; readonly max: number }[];
}

function validValue(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

function rangeOf(points: readonly SignalPoint[]): { min: number; max: number } | null {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const [, value] of points) {
    if (!validValue(value)) continue;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null;
}

function normalize(value: number | null, range: { min: number; max: number }): number | null {
  if (!validValue(value)) return null;
  const span = range.max - range.min;
  return span > 0 ? ((value - range.min) / span) * 100 : 50;
}

/** Linear merge of the independently sampled X coordinates. */
function mergeTimes(panels: readonly SignalChartPanel[]): number[] {
  const times = new Set<number>();
  for (const panel of panels) {
    for (const [time] of panel.reference) if (Number.isFinite(time)) times.add(time);
    for (const [time] of panel.comparison) if (Number.isFinite(time)) times.add(time);
  }
  return [...times].sort((a, b) => a - b);
}

/**
 * Interpolate only for rendering onto uPlot's shared X array. Source measurements
 * remain untouched; null gaps are preserved and interpolation never crosses them.
 */
function alignAndNormalize(
  points: readonly SignalPoint[],
  x: readonly number[],
  range: { min: number; max: number },
): (number | null)[] {
  const output = new Array<number | null>(x.length).fill(null);
  let rightIndex = 0;

  for (let index = 0; index < x.length; index += 1) {
    const time = x[index];
    while (rightIndex < points.length && points[rightIndex][0] < time) rightIndex += 1;

    const right = points[rightIndex];
    if (right && right[0] === time) {
      output[index] = normalize(right[1], range);
      continue;
    }

    const left = points[rightIndex - 1];
    if (!left || !right || !validValue(left[1]) || !validValue(right[1])) continue;
    const span = right[0] - left[0];
    if (!(span > 0)) continue;
    const ratio = (time - left[0]) / span;
    output[index] = normalize(left[1] + (right[1] - left[1]) * ratio, range);
  }

  return output;
}

export function buildUPlotSeriesData(panels: readonly SignalChartPanel[]): UPlotSeriesData {
  const x = mergeTimes(panels);
  const series: (number | null)[][] = [];
  const ranges: { min: number; max: number }[] = [];

  for (const panel of panels) {
    const referenceRange = rangeOf(panel.reference);
    const comparisonRange = rangeOf(panel.comparison);
    const values = [referenceRange?.min, comparisonRange?.min].filter(
      (value): value is number => value !== undefined,
    );
    const maxima = [referenceRange?.max, comparisonRange?.max].filter(
      (value): value is number => value !== undefined,
    );
    const range = values.length
      ? { min: Math.min(...values), max: Math.max(...maxima) }
      : { min: 0, max: 0 };

    ranges.push(range);
    series.push(alignAndNormalize(panel.reference, x, range));
    series.push(alignAndNormalize(panel.comparison, x, range));
  }

  return { x, series, ranges };
}
