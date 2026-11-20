import type { SignalPoint } from '@/features/measurements/plot-data';

export interface SignalSummary {
  readonly current: number | null;
  readonly maximum: number | null;
  readonly difference: number | null;
}

function valueAt(points: readonly SignalPoint[], time: number | null): number | null {
  if (time === null || points.length === 0) return null;
  let low = 0;
  let high = points.length - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    if (points[middle][0] < time) low = middle + 1;
    else if (points[middle][0] > time) high = middle - 1;
    else return points[middle][1];
  }
  const left = points[high];
  const right = points[low];
  if (!left || !right || left[1] === null || right[1] === null) return null;
  const span = right[0] - left[0];
  if (span <= 0) return null;
  const ratio = (time - left[0]) / span;
  return left[1] + (right[1] - left[1]) * ratio;
}

function maximumInRange(points: readonly SignalPoint[], start: number, end: number): number | null {
  let maximum = Number.NEGATIVE_INFINITY;
  for (const [time, value] of points) {
    if (time < start || time > end || value === null || !Number.isFinite(value)) continue;
    maximum = Math.max(maximum, value);
  }
  return Number.isFinite(maximum) ? maximum : null;
}

export function getSignalSummary(
  reference: readonly SignalPoint[],
  comparison: readonly SignalPoint[],
  cursorTime: number | null,
  rangeStart: number,
  rangeEnd: number,
): SignalSummary {
  const latestComparisonTime = cursorTime === null
    ? comparison.reduce((latest, point) => point[0] >= rangeStart && point[0] <= rangeEnd && point[1] !== null ? Math.max(latest, point[0]) : latest, Number.NEGATIVE_INFINITY)
    : cursorTime;
  const activeTime = Number.isFinite(latestComparisonTime) ? latestComparisonTime : null;
  const referenceCurrent = valueAt(reference, activeTime);
  const comparisonCurrent = valueAt(comparison, activeTime);
  return {
    current: comparisonCurrent,
    maximum: maximumInRange(comparison, rangeStart, rangeEnd),
    difference: referenceCurrent !== null && comparisonCurrent !== null
      ? referenceCurrent - comparisonCurrent
      : null,
  };
}
