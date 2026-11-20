import type { ChannelWindow } from './model';

export type SignalPoint = [timeSeconds: number, value: number | null];

export interface ComparisonPlotData {
  readonly reference: SignalPoint[];
  readonly comparison: SignalPoint[];
}

/**
 * Prepare two independently sampled series for a shared numeric time axis.
 *
 * Keeping each run's native points separate avoids an O(n log n) union/merge
 * and does not fabricate values at timestamps that exist only in the other run.
 */
export function buildSignalPoints(
  timeSeconds: Float64Array,
  values: Float64Array,
  timeOffsetSeconds = 0,
  timestampErrorMessage = 'Signal timestamps must be finite.',
): SignalPoint[] {
  if (!Number.isFinite(timeOffsetSeconds)) {
    throw new RangeError('Signal time offset must be finite.');
  }

  if (timeSeconds.length !== values.length) {
    throw new RangeError('Signal time and value arrays must have equal lengths.');
  }

  const points = new Array<SignalPoint>(timeSeconds.length);

  for (let index = 0; index < timeSeconds.length; index += 1) {
    const time = timeSeconds[index] + timeOffsetSeconds;

    if (!Number.isFinite(time)) throw new RangeError(timestampErrorMessage);

    const value = values[index];
    points[index] = [time, Number.isFinite(value) ? value : null];
  }

  return points;
}

export function buildComparisonPlotData(
  reference: ChannelWindow,
  comparison: ChannelWindow,
  comparisonOffsetSeconds: number,
): ComparisonPlotData {
  if (!Number.isFinite(comparisonOffsetSeconds)) {
    throw new RangeError('Comparison offset must be finite.');
  }

  if (reference.timeSeconds.length !== reference.values.length) {
    throw new RangeError('Reference time and value arrays must have equal lengths.');
  }

  if (comparison.timeSeconds.length !== comparison.values.length) {
    throw new RangeError('Comparison time and value arrays must have equal lengths.');
  }

  return {
    reference: buildSignalPoints(reference.timeSeconds, reference.values),
    comparison: buildSignalPoints(
      comparison.timeSeconds,
      comparison.values,
      comparisonOffsetSeconds,
      'Aligned comparison timestamps must be finite.',
    ),
  };
}
