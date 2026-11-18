import type { ChannelWindow } from './model';

export type SignalPoint = [timeSeconds: number, value: number | null];

export interface ComparisonPlotData {
  readonly reference: readonly SignalPoint[];
  readonly comparison: readonly SignalPoint[];
}

/**
 * Prepare two independently sampled series for a shared numeric time axis.
 *
 * Keeping each run's native points separate avoids an O(n log n) union/merge
 * and does not fabricate values at timestamps that exist only in the other run.
 */
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

  const referencePoints = new Array<SignalPoint>(reference.timeSeconds.length);
  for (let index = 0; index < reference.timeSeconds.length; index += 1) {
    const time = reference.timeSeconds[index];
    if (!Number.isFinite(time)) throw new RangeError('Reference timestamps must be finite.');
    const value = reference.values[index];
    referencePoints[index] = [time, Number.isFinite(value) ? value : null];
  }

  const comparisonPoints = new Array<SignalPoint>(comparison.timeSeconds.length);
  for (let index = 0; index < comparison.timeSeconds.length; index += 1) {
    const time = comparison.timeSeconds[index] + comparisonOffsetSeconds;
    if (!Number.isFinite(time)) throw new RangeError('Aligned comparison timestamps must be finite.');
    const value = comparison.values[index];
    comparisonPoints[index] = [time, Number.isFinite(value) ? value : null];
  }

  return { reference: referencePoints, comparison: comparisonPoints };
}
