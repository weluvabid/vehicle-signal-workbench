import type { ChannelWindow } from './model';

export { downsampleDifferenceEnvelope } from './difference-envelope';

/**
 * Engineering comparison contract, version 1:
 * - Delta is reference minus comparison, in the shared native unit.
 * - Comparison is evaluated at reference timestamps using linear interpolation.
 * - Exact timestamp matches are preferred (1 ns absolute tolerance).
 * - Interpolation is allowed only between adjacent, finite comparison samples.
 * - The bracket interval must not exceed maxInterpolationGapFactor * median cadence.
 * - No extrapolation, unit conversion, or bridging across missing samples.
 */
export const DIFFERENCE_POLICY = Object.freeze({
  version: 1,
  maxInterpolationGapFactor: 2.5,
  exactMatchToleranceSeconds: 1e-9,
});

export interface DifferenceStatistics {
  readonly policyVersion: 1;
  readonly direction: 'reference-minus-comparison';
  readonly matchedCount: number;
  readonly unavailableCount: number;
  readonly bias: number | null;
  readonly meanAbsoluteError: number | null;
  readonly rootMeanSquareError: number | null;
  readonly maximumAbsoluteError: number | null;
  readonly maxInterpolationGapSeconds: number | null;
}

export interface DifferenceResult {
  readonly timeSeconds: Float64Array;
  readonly referenceValues: Float64Array;
  readonly comparisonValues: Float64Array;
  readonly delta: Float64Array;
  readonly statistics: DifferenceStatistics;
}

export interface DifferenceSource {
  readonly datasetId: string;
  readonly channelId: string;
  readonly timeSeconds: Float64Array;
  readonly values: Float64Array;
}

/** Calculate visible-window difference metrics directly over worker-owned buffers. */
export function calculateSignalDifferenceInTimeRange(
  referenceSource: DifferenceSource,
  comparisonSource: DifferenceSource,
  startSeconds: number,
  endSeconds: number,
  comparisonOffsetSeconds: number,
): DifferenceStatistics {
  if (
    !Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || endSeconds < startSeconds ||
    !Number.isFinite(comparisonOffsetSeconds) ||
    referenceSource.timeSeconds.length !== referenceSource.values.length ||
    comparisonSource.timeSeconds.length !== comparisonSource.values.length
  ) {
    throw new RangeError('Invalid difference source or visible time range.');
  }

  const referenceStart = lowerBound(referenceSource.timeSeconds, startSeconds);
  const referenceEnd = lowerBound(referenceSource.timeSeconds, endSeconds);
  const comparisonStartTime = startSeconds - comparisonOffsetSeconds;
  const comparisonEndTime = endSeconds - comparisonOffsetSeconds;
  if (!Number.isFinite(comparisonStartTime) || !Number.isFinite(comparisonEndTime)) {
    throw new RangeError('Aligned comparison time range must be finite.');
  }
  const comparisonStart = Math.max(0, lowerBound(comparisonSource.timeSeconds, comparisonStartTime) - 1);
  const comparisonEnd = Math.min(
    comparisonSource.timeSeconds.length,
    lowerBound(comparisonSource.timeSeconds, comparisonEndTime) + 1,
  );

  const referenceWindow: ChannelWindow = {
    datasetId: referenceSource.datasetId,
    channelId: referenceSource.channelId,
    startIndex: referenceStart,
    timeSeconds: referenceSource.timeSeconds.subarray(referenceStart, referenceEnd),
    values: referenceSource.values.subarray(referenceStart, referenceEnd),
  };
  const comparisonWindow: ChannelWindow = {
    datasetId: comparisonSource.datasetId,
    channelId: comparisonSource.channelId,
    startIndex: comparisonStart,
    timeSeconds: comparisonSource.timeSeconds.subarray(comparisonStart, comparisonEnd),
    values: comparisonSource.values.subarray(comparisonStart, comparisonEnd),
  };
  const nominalCadence = medianSampleInterval(comparisonSource);
  return calculateDifference(
    referenceWindow,
    comparisonWindow,
    comparisonOffsetSeconds,
    nominalCadence,
    false,
  ).statistics;
}

/** Calculate the full reference-timestamped delta series for a bounded time range. */
export function calculateSignalDifferenceSeriesInTimeRange(
  referenceSource: DifferenceSource,
  comparisonSource: DifferenceSource,
  startSeconds: number,
  endSeconds: number,
  comparisonOffsetSeconds: number,
): DifferenceResult {
  if (
    !Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || endSeconds < startSeconds ||
    !Number.isFinite(comparisonOffsetSeconds) ||
    referenceSource.timeSeconds.length !== referenceSource.values.length ||
    comparisonSource.timeSeconds.length !== comparisonSource.values.length
  ) {
    throw new RangeError('Invalid difference source or visible time range.');
  }
  const referenceStart = lowerBound(referenceSource.timeSeconds, startSeconds);
  const referenceEnd = lowerBound(referenceSource.timeSeconds, endSeconds);
  const comparisonStartTime = startSeconds - comparisonOffsetSeconds;
  const comparisonEndTime = endSeconds - comparisonOffsetSeconds;
  if (!Number.isFinite(comparisonStartTime) || !Number.isFinite(comparisonEndTime)) {
    throw new RangeError('Aligned comparison time range must be finite.');
  }
  const comparisonStart = Math.max(0, lowerBound(comparisonSource.timeSeconds, comparisonStartTime) - 1);
  const comparisonEnd = Math.min(comparisonSource.timeSeconds.length, lowerBound(comparisonSource.timeSeconds, comparisonEndTime) + 1);
  const referenceWindow: ChannelWindow = {
    datasetId: referenceSource.datasetId, channelId: referenceSource.channelId,
    startIndex: referenceStart,
    timeSeconds: referenceSource.timeSeconds.subarray(referenceStart, referenceEnd),
    values: referenceSource.values.subarray(referenceStart, referenceEnd),
  };
  const comparisonWindow: ChannelWindow = {
    datasetId: comparisonSource.datasetId, channelId: comparisonSource.channelId,
    startIndex: comparisonStart,
    timeSeconds: comparisonSource.timeSeconds.subarray(comparisonStart, comparisonEnd),
    values: comparisonSource.values.subarray(comparisonStart, comparisonEnd),
  };
  const fullRunCadence = medianSampleInterval({
    timeSeconds: comparisonSource.timeSeconds,
    values: comparisonSource.values,
  });
  return calculateSignalDifference(referenceWindow, comparisonWindow, comparisonOffsetSeconds, fullRunCadence);
}

/** Returns a bounded-sample median of positive adjacent timestamp intervals. */
export function medianSampleInterval(window: Pick<ChannelWindow, 'timeSeconds' | 'values'>): number | null {
  if (window.timeSeconds.length !== window.values.length) {
    throw new RangeError('Cadence input time and value arrays must have equal lengths.');
  }
  const intervals: number[] = [];
  const intervalCount = Math.max(0, window.timeSeconds.length - 1);
  const stride = Math.max(1, Math.ceil(intervalCount / 4_096));
  for (let index = 1; index < window.timeSeconds.length; index += stride) {
    const interval = window.timeSeconds[index] - window.timeSeconds[index - 1];
    if (!Number.isFinite(interval) || interval <= 0) {
      throw new RangeError('Sampled cadence timestamps must be finite and strictly increasing.');
    }
    intervals.push(interval);
  }
  if (intervals.length === 0) return null;
  intervals.sort((a, b) => a - b);
  const middle = Math.floor(intervals.length / 2);
  return intervals.length % 2 === 0
    ? (intervals[middle - 1] + intervals[middle]) / 2
    : intervals[middle];
}

export function calculateSignalDifference(
  reference: ChannelWindow,
  comparison: ChannelWindow,
  comparisonOffsetSeconds: number,
  nominalSampleIntervalSeconds: number | null = medianSampleInterval(comparison),
): DifferenceResult {
  const result = calculateDifference(
    reference,
    comparison,
    comparisonOffsetSeconds,
    nominalSampleIntervalSeconds,
    true,
  );
  return {
    timeSeconds: result.timeSeconds as Float64Array,
    referenceValues: result.referenceValues as Float64Array,
    comparisonValues: result.comparisonValues as Float64Array,
    delta: result.delta as Float64Array,
    statistics: result.statistics,
  };
}

interface InternalDifferenceResult {
  readonly timeSeconds: Float64Array | null;
  readonly referenceValues: Float64Array | null;
  readonly comparisonValues: Float64Array | null;
  readonly delta: Float64Array | null;
  readonly statistics: DifferenceStatistics;
}

function calculateDifference(
  reference: ChannelWindow,
  comparison: ChannelWindow,
  comparisonOffsetSeconds: number,
  nominalSampleIntervalSeconds: number | null,
  includeSeries: boolean,
): InternalDifferenceResult {
  validateWindow(reference);
  validateWindow(comparison);
  if (!Number.isFinite(comparisonOffsetSeconds)) throw new RangeError('Comparison offset must be finite.');

  if (nominalSampleIntervalSeconds !== null &&
      (!Number.isFinite(nominalSampleIntervalSeconds) || nominalSampleIntervalSeconds <= 0)) {
    throw new RangeError('Nominal sample interval must be positive and finite.');
  }
  const maxGap = nominalSampleIntervalSeconds === null
    ? null
    : nominalSampleIntervalSeconds * DIFFERENCE_POLICY.maxInterpolationGapFactor;
  // Series responses are transferred to the UI. These copies isolate the
  // response buffers from worker-owned dataset storage and its subarray views.
  const timeSeconds = includeSeries ? reference.timeSeconds.slice() : null;
  const referenceValues = includeSeries ? reference.values.slice() : null;
  const comparisonValues = includeSeries ? new Float64Array(reference.values.length) : null;
  const delta = includeSeries ? new Float64Array(reference.values.length) : null;
  delta?.fill(Number.NaN);
  comparisonValues?.fill(Number.NaN);

  let matchedCount = 0;
  let bias = 0;
  let meanAbsoluteError = 0;
  let squaredErrorScale = 0;
  let scaledSquaredErrorSum = 1;
  let maximumAbsoluteError = 0;
  let comparisonCursor = 0;

  for (let index = 0; index < reference.values.length; index += 1) {
    const referenceValue = reference.values[index];
    if (!Number.isFinite(referenceValue)) continue;

    const comparisonTime = reference.timeSeconds[index] - comparisonOffsetSeconds;
    while (comparisonCursor < comparison.timeSeconds.length &&
        comparison.timeSeconds[comparisonCursor] < comparisonTime - DIFFERENCE_POLICY.exactMatchToleranceSeconds) {
      comparisonCursor += 1;
    }
    const comparisonValue = interpolateWithoutCrossingGaps(
      comparison,
      comparisonTime,
      maxGap,
      comparisonCursor,
    );
    if (comparisonValue === null) continue;

    const difference = referenceValue - comparisonValue;
    if (!Number.isFinite(difference)) continue;
    if (delta) delta[index] = difference;
    if (comparisonValues) comparisonValues[index] = comparisonValue;
    matchedCount += 1;
    bias += (difference - bias) / matchedCount;
    const absoluteDifference = Math.abs(difference);
    meanAbsoluteError += (absoluteDifference - meanAbsoluteError) / matchedCount;
    if (absoluteDifference > 0) {
      if (squaredErrorScale < absoluteDifference) {
        const ratio = squaredErrorScale / absoluteDifference;
        scaledSquaredErrorSum = 1 + scaledSquaredErrorSum * ratio * ratio;
        squaredErrorScale = absoluteDifference;
      } else {
        const ratio = absoluteDifference / squaredErrorScale;
        scaledSquaredErrorSum += ratio * ratio;
      }
    }
    maximumAbsoluteError = Math.max(maximumAbsoluteError, absoluteDifference);
  }

  const sampleCount = reference.values.length;
  const statistics: DifferenceStatistics = {
    policyVersion: 1,
    direction: 'reference-minus-comparison',
    matchedCount,
    unavailableCount: sampleCount - matchedCount,
    bias: matchedCount === 0 ? null : bias,
    meanAbsoluteError: matchedCount === 0 ? null : meanAbsoluteError,
    rootMeanSquareError: matchedCount === 0
      ? null
      : squaredErrorScale === 0
        ? 0
        : squaredErrorScale * Math.sqrt(scaledSquaredErrorSum / matchedCount),
    maximumAbsoluteError: matchedCount === 0 ? null : maximumAbsoluteError,
    maxInterpolationGapSeconds: maxGap,
  };

  return { timeSeconds, referenceValues, comparisonValues, delta, statistics };
}

function interpolateWithoutCrossingGaps(
  comparison: ChannelWindow,
  targetSeconds: number,
  maxGapSeconds: number | null,
  right: number,
): number | null {
  const times = comparison.timeSeconds;
  const values = comparison.values;
  const tolerance = DIFFERENCE_POLICY.exactMatchToleranceSeconds;
  if (right < times.length && Math.abs(times[right] - targetSeconds) <= tolerance) {
    return Number.isFinite(values[right]) ? values[right] : null;
  }

  if (maxGapSeconds === null) return null;
  const left = right - 1;
  if (left < 0 || right >= times.length) return null;
  const leftValue = values[left];
  const rightValue = values[right];
  if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) return null;

  const interval = times[right] - times[left];
  if (!(interval > 0) || interval > maxGapSeconds) return null;
  const ratio = (targetSeconds - times[left]) / interval;
  if (ratio < 0 || ratio > 1) return null;
  return leftValue + (rightValue - leftValue) * ratio;
}

function lowerBound(values: Float64Array, target: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (values[middle] < target) low = middle + 1;
    else high = middle;
  }
  return low;
}

function validateWindow(window: ChannelWindow): void {
  if (window.timeSeconds.length !== window.values.length) {
    throw new RangeError('Difference input time and value arrays must have equal lengths.');
  }
  for (let index = 0; index < window.timeSeconds.length; index += 1) {
    const time = window.timeSeconds[index];
    if (!Number.isFinite(time) || (index > 0 && time <= window.timeSeconds[index - 1])) {
      throw new RangeError('Difference input timestamps must be finite and strictly increasing.');
    }
  }
}
