import type { SignalPoint } from '@/features/measurements/plot-data';

export interface InspectedSample {
  readonly value: number | null;
  readonly interpolated: boolean;
}

/** Returns an exact sample or linearly interpolates between adjacent valid samples. */
export function sampleSignalAt(points: readonly SignalPoint[], target: number): InspectedSample {
  let low = 0;
  let high = points.length;

  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);

    if (points[middle][0] < target) low = middle + 1;
    else high = middle;
  }

  const right = points[low];

  if (right && right[0] === target) {
    return {
      value: right[1] !== null && Number.isFinite(right[1]) ? right[1] : null,
      interpolated: false,
    };
  }

  const left = points[low - 1];

  if (!left || !right || left[1] === null || right[1] === null)
    return { value: null, interpolated: false };

  if (!Number.isFinite(left[1]) || !Number.isFinite(right[1]))
    return { value: null, interpolated: false };

  const span = right[0] - left[0];

  if (!(span > 0)) return { value: null, interpolated: false };

  return {
    value: left[1] + (right[1] - left[1]) * ((target - left[0]) / span),
    interpolated: true,
  };
}
