import type { ChannelStatistics, ChannelWindow } from './model';

export { buildChannelEnvelopeIndex, queryChannelEnvelopeTimeWindow, queryChannelTimeStatistics } from './envelope-index';
export type { ChannelEnvelopeIndex } from './envelope-index';

export interface ChannelBuffers {
  readonly timeSeconds: Float64Array;
  readonly values: Float64Array;
}

export function queryChannelWindow(
  datasetId: string,
  channelId: string,
  buffers: ChannelBuffers,
  startIndex: number,
  endIndex: number,
): ChannelWindow {
  validateRange(buffers, startIndex, endIndex);

  // Query buffers are transferred to the UI. Copy the bounded range so the
  // transfer cannot detach the worker-owned canonical dataset buffers.
  return {
    datasetId,
    channelId,
    startIndex,
    timeSeconds: buffers.timeSeconds.slice(startIndex, endIndex),
    values: buffers.values.slice(startIndex, endIndex),
  };
}

export function calculateChannelStatistics(
  datasetId: string,
  channelId: string,
  values: Float64Array,
  startIndex: number,
  endIndex: number,
): ChannelStatistics {
  if (!Number.isInteger(startIndex) || !Number.isInteger(endIndex) ||
      startIndex < 0 || endIndex < startIndex || endIndex > values.length) {
    throw new RangeError('Invalid channel statistics range.');
  }

  let validCount = 0;
  let mean = 0;
  let sumSquaredDeviation = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (let index = startIndex; index < endIndex; index += 1) {
    const value = values[index];

    if (!Number.isFinite(value)) continue;

    validCount += 1;
    const delta = value - mean;
    mean += delta / validCount;
    sumSquaredDeviation += delta * (value - mean);
    min = Math.min(min, value);
    max = Math.max(max, value);
  }

  const sampleCount = endIndex - startIndex;
  const missingCount = sampleCount - validCount;

  return {
    datasetId,
    channelId,
    startIndex,
    endIndex,
    sampleCount,
    validCount,
    missingCount,
    min: validCount === 0 ? null : min,
    max: validCount === 0 ? null : max,
    mean: validCount === 0 ? null : mean,
    standardDeviation: validCount === 0
      ? null
      : Math.sqrt(sumSquaredDeviation / validCount),
  };
}

function validateRange(
  buffers: ChannelBuffers,
  startIndex: number,
  endIndex: number,
): void {
  if (
    buffers.timeSeconds.length !== buffers.values.length ||
    !Number.isInteger(startIndex) ||
    !Number.isInteger(endIndex) ||
    startIndex < 0 ||
    endIndex < startIndex ||
    endIndex > buffers.values.length
  ) {
    throw new RangeError('Invalid channel window range.');
  }
}

/** Compute statistics for samples in a half-open elapsed-time interval. */
export function queryChannelTimeWindow(
  datasetId: string,
  channelId: string,
  buffers: ChannelBuffers,
  startSeconds: number,
  endSeconds: number,
): ChannelWindow {
  if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || endSeconds < startSeconds) {
    throw new RangeError('Invalid channel time window.');
  }

  const lowerBound = (target: number): number => {
    let low = 0;
    let high = buffers.timeSeconds.length;
    while (low < high) {
      const middle = low + Math.floor((high - low) / 2);
      if (buffers.timeSeconds[middle] < target) low = middle + 1;
      else high = middle;
    }
    return low;
  };

  const startIndex = lowerBound(startSeconds);
  const endIndex = lowerBound(endSeconds);
  return queryChannelWindow(datasetId, channelId, buffers, startIndex, endIndex);
}
