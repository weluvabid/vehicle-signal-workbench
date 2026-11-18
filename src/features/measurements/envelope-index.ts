import type { ChannelStatistics, ChannelWindow } from './model';
import type { ChannelBuffers } from './windowing';
import { Float64BufferBuilder } from './float64-buffer';

export function queryChannelTimeStatistics(
  datasetId: string,
  channelId: string,
  buffers: ChannelBuffers,
  index: ChannelEnvelopeIndex,
  startSeconds: number,
  endSeconds: number,
): ChannelStatistics {
  if (
    buffers.timeSeconds.length !== buffers.values.length ||
    !Number.isFinite(startSeconds) ||
    !Number.isFinite(endSeconds) ||
    endSeconds < startSeconds
  ) {
    throw new RangeError('Invalid channel statistics time window.');
  }

  const startIndex = lowerBound(buffers.timeSeconds, startSeconds);
  const endIndex = lowerBound(buffers.timeSeconds, endSeconds);
  const sampleCount = endIndex - startIndex;
  if (sampleCount === 0) {
    return {
      datasetId, channelId, startIndex, endIndex, sampleCount: 0,
      validCount: 0, missingCount: 0, min: null, max: null, mean: null,
      standardDeviation: null,
    };
  }

  const blockSize = index.blockSize;
  const firstFullBlock = Math.ceil(startIndex / blockSize);
  const endFullBlock = Math.floor(endIndex / blockSize);
  const hasFullBlocks = firstFullBlock < endFullBlock;
  const prefixEnd = hasFullBlocks ? firstFullBlock * blockSize : endIndex;
  const suffixStart = hasFullBlocks ? endFullBlock * blockSize : endIndex;

  let aggregate: StatisticsAggregate = { count: 0, mean: 0, m2: 0 };
  const scan = (from: number, to: number): StatisticsAggregate => {
    let result: StatisticsAggregate = { count: 0, mean: 0, m2: 0 };
    for (let sample = from; sample < to; sample += 1) {
      const value = buffers.values[sample];
      if (!Number.isFinite(value)) continue;
      result = mergeStatistics(result, { count: 1, mean: value, m2: 0 });
    }
    return result;
  };

  aggregate = mergeStatistics(aggregate, scan(startIndex, prefixEnd));
  if (hasFullBlocks) {
    aggregate = mergeStatistics(aggregate, queryStatisticsBlocks(index, firstFullBlock, endFullBlock));
  }
  aggregate = mergeStatistics(aggregate, scan(suffixStart, endIndex));

  const extrema = queryEnvelopeSummary(buffers.values, index, startIndex, endIndex);
  const missingCount = sampleCount - aggregate.count;
  return {
    datasetId,
    channelId,
    startIndex,
    endIndex,
    sampleCount,
    validCount: aggregate.count,
    missingCount,
    min: extrema.minIndex < 0 ? null : buffers.values[extrema.minIndex],
    max: extrema.maxIndex < 0 ? null : buffers.values[extrema.maxIndex],
    mean: aggregate.count === 0 ? null : aggregate.mean,
    standardDeviation: aggregate.count === 0 ? null : Math.sqrt(aggregate.m2 / aggregate.count),
  };
}

/** Query a half-open elapsed-time interval without transferring unrelated samples. */
export interface ChannelEnvelopeIndex {
  readonly blockSize: number;
  readonly treeSize: number;
  readonly minIndex: Int32Array;
  readonly maxIndex: Int32Array;
  readonly missingCount: Uint32Array;
  readonly validCount: Uint32Array;
  readonly mean: Float64Array;
  readonly sumSquaredDeviation: Float64Array;
}

const ENVELOPE_BLOCK_SIZE = 64;
const MAX_BUCKETS = 8_192;
const MAX_BUCKET_POINTS = 8;
const MAX_GAP_SCAN_SAMPLES = 256;

/**
 * Builds a compact block segment tree. It stores extrema sample indices and
 * Welford aggregates, not duplicated signal values, so viewport and statistics
 * queries avoid rescanning full measurement windows.
 */
export function buildChannelEnvelopeIndex(values: Float64Array): ChannelEnvelopeIndex {
  const blockCount = Math.ceil(values.length / ENVELOPE_BLOCK_SIZE);
  let treeSize = 1;
  while (treeSize < blockCount) treeSize *= 2;

  const minIndex = new Int32Array(treeSize * 2);
  const maxIndex = new Int32Array(treeSize * 2);
  const missingCount = new Uint32Array(treeSize * 2);
  const validCount = new Uint32Array(treeSize * 2);
  const mean = new Float64Array(treeSize * 2);
  const sumSquaredDeviation = new Float64Array(treeSize * 2);
  minIndex.fill(-1);
  maxIndex.fill(-1);

  for (let block = 0; block < blockCount; block += 1) {
    const start = block * ENVELOPE_BLOCK_SIZE;
    const end = Math.min(values.length, start + ENVELOPE_BLOCK_SIZE);
    let min = -1;
    let max = -1;
    let missing = 0;
    let count = 0;
    let blockMean = 0;
    let blockM2 = 0;

    for (let index = start; index < end; index += 1) {
      const value = values[index];
      if (!Number.isFinite(value)) {
        missing += 1;
        continue;
      }
      if (min < 0 || value < values[min]) min = index;
      if (max < 0 || value > values[max]) max = index;
      count += 1;
      const delta = value - blockMean;
      blockMean += delta / count;
      blockM2 += delta * (value - blockMean);
    }

    const leaf = treeSize + block;
    minIndex[leaf] = min;
    maxIndex[leaf] = max;
    missingCount[leaf] = missing;
    validCount[leaf] = count;
    mean[leaf] = blockMean;
    sumSquaredDeviation[leaf] = blockM2;
  }

  for (let node = treeSize - 1; node > 0; node -= 1) {
    const left = node * 2;
    const right = left + 1;
    minIndex[node] = chooseIndex(values, minIndex[left], minIndex[right], 'min');
    maxIndex[node] = chooseIndex(values, maxIndex[left], maxIndex[right], 'max');
    missingCount[node] = missingCount[left] + missingCount[right];
    const merged = mergeStatistics(
      { count: validCount[left], mean: mean[left], m2: sumSquaredDeviation[left] },
      { count: validCount[right], mean: mean[right], m2: sumSquaredDeviation[right] },
    );
    validCount[node] = merged.count;
    mean[node] = merged.mean;
    sumSquaredDeviation[node] = merged.m2;
  }

  return {
    blockSize: ENVELOPE_BLOCK_SIZE,
    treeSize,
    minIndex,
    maxIndex,
    missingCount,
    validCount,
    mean,
    sumSquaredDeviation,
  };
}

/**
 * Returns a time-bounded min/max envelope sized to the chart's CSS pixel width.
 * Each time bucket preserves first/last/min/max samples. Buckets containing a
 * small number of missing runs retain explicit gap markers. Missing-data buckets
 * larger than 256 samples, or with too many transitions, collapse to a gap rather
 * than scanning an unbounded range or drawing false continuity.
 */
export function queryChannelEnvelopeTimeWindow(
  datasetId: string,
  channelId: string,
  buffers: ChannelBuffers,
  index: ChannelEnvelopeIndex,
  startSeconds: number,
  endSeconds: number,
  pixelWidth: number,
): ChannelWindow {
  validateRange(buffers, 0, buffers.values.length);
  if (
    !Number.isFinite(startSeconds) ||
    !Number.isFinite(endSeconds) ||
    endSeconds < startSeconds ||
    !Number.isFinite(endSeconds - startSeconds) ||
    !Number.isInteger(pixelWidth) ||
    pixelWidth < 1
  ) {
    throw new RangeError('Invalid channel envelope query.');
  }

  const startIndex = lowerBound(buffers.timeSeconds, startSeconds);
  const endIndex = lowerBound(buffers.timeSeconds, endSeconds);
  if (startIndex >= endIndex) {
    return {
      datasetId, channelId, startIndex,
      timeSeconds: new Float64Array(0), values: new Float64Array(0),
    };
  }

  const bucketCount = Math.max(1, Math.min(pixelWidth, MAX_BUCKETS));
  const duration = endSeconds - startSeconds;
  // At most MAX_BUCKET_POINTS are retained per bucket. Numeric output stays
  // in typed buffers instead of boxing every sample in JS number arrays.
  const outputCapacity = Math.min(endIndex - startIndex, bucketCount * MAX_BUCKET_POINTS);
  const outputTimes = new Float64BufferBuilder(outputCapacity);
  const outputValues = new Float64BufferBuilder(outputCapacity);
  let cursor = startIndex;

  for (let bucket = 0; bucket < bucketCount && cursor < endIndex; bucket += 1) {
    const bucketStart = startSeconds + duration * (bucket / bucketCount);
    const bucketEnd = bucket === bucketCount - 1
      ? endSeconds
      : startSeconds + duration * ((bucket + 1) / bucketCount);

    while (cursor < endIndex && buffers.timeSeconds[cursor] < bucketStart) cursor += 1;
    const bucketSampleStart = cursor;
    while (cursor < endIndex && buffers.timeSeconds[cursor] < bucketEnd) cursor += 1;
    const bucketSampleEnd = cursor;
    if (bucketSampleStart >= bucketSampleEnd) continue;

    const summary = queryEnvelopeSummary(
      buffers.values,
      index,
      bucketSampleStart,
      bucketSampleEnd,
    );

    if (summary.missingCount === 0) {
      const candidates = uniqueSorted([
        bucketSampleStart,
        bucketSampleEnd - 1,
        summary.minIndex,
        summary.maxIndex,
      ]);
      for (const sampleIndex of candidates) {
        outputTimes.push(buffers.timeSeconds[sampleIndex]);
        outputValues.push(buffers.values[sampleIndex]);
      }
      continue;
    }

    if (bucketSampleEnd - bucketSampleStart > MAX_GAP_SCAN_SAMPLES) {
      appendGap(outputTimes, outputValues, buffers.timeSeconds, bucketSampleStart, bucketSampleEnd);
      continue;
    }

    const candidates = collectGapAwareCandidates(
      buffers.values,
      bucketSampleStart,
      bucketSampleEnd,
      MAX_BUCKET_POINTS,
    );

    if (candidates === null) {
      appendGap(outputTimes, outputValues, buffers.timeSeconds, bucketSampleStart, bucketSampleEnd);
      continue;
    }

    for (const sampleIndex of candidates) {
      outputTimes.push(buffers.timeSeconds[sampleIndex]);
      outputValues.push(Number.isFinite(buffers.values[sampleIndex]) ? buffers.values[sampleIndex] : Number.NaN);
    }
  }

  return {
    datasetId,
    channelId,
    startIndex,
    timeSeconds: outputTimes.finish(),
    values: outputValues.finish(),
  };
}


function appendGap(
  outputTimes: Float64BufferBuilder,
  outputValues: Float64BufferBuilder,
  timeSeconds: Float64Array,
  start: number,
  end: number,
): void {
  outputTimes.push(timeSeconds[start]);
  outputValues.push(Number.NaN);
  if (end - 1 !== start) {
    outputTimes.push(timeSeconds[end - 1]);
    outputValues.push(Number.NaN);
  }
}

interface EnvelopeSummary {
  readonly minIndex: number;
  readonly maxIndex: number;
  readonly missingCount: number;
}

interface StatisticsAggregate {
  readonly count: number;
  readonly mean: number;
  readonly m2: number;
}

function mergeStatistics(
  left: StatisticsAggregate,
  right: StatisticsAggregate,
): StatisticsAggregate {
  if (left.count === 0) return right;
  if (right.count === 0) return left;
  const count = left.count + right.count;
  const delta = right.mean - left.mean;
  const mean = left.mean + delta * (right.count / count);
  const m2 = left.m2 + right.m2 + delta * delta * (left.count * (right.count / count));
  return { count, mean, m2 };
}

function queryStatisticsBlocks(
  index: ChannelEnvelopeIndex,
  startBlock: number,
  endBlock: number,
): StatisticsAggregate {
  let left = index.treeSize + startBlock;
  let right = index.treeSize + endBlock;
  let aggregate: StatisticsAggregate = { count: 0, mean: 0, m2: 0 };
  while (left < right) {
    if (left & 1) {
      aggregate = mergeStatistics(aggregate, {
        count: index.validCount[left],
        mean: index.mean[left],
        m2: index.sumSquaredDeviation[left],
      });
      left += 1;
    }
    if (right & 1) {
      right -= 1;
      aggregate = mergeStatistics(aggregate, {
        count: index.validCount[right],
        mean: index.mean[right],
        m2: index.sumSquaredDeviation[right],
      });
    }
    left = Math.floor(left / 2);
    right = Math.floor(right / 2);
  }
  return aggregate;
}

function queryEnvelopeSummary(
  values: Float64Array,
  index: ChannelEnvelopeIndex,
  start: number,
  end: number,
): EnvelopeSummary {
  const blockSize = index.blockSize;
  const firstFullBlock = Math.ceil(start / blockSize);
  const endFullBlock = Math.floor(end / blockSize);
  const hasFullBlocks = firstFullBlock < endFullBlock;
  const prefixEnd = hasFullBlocks ? firstFullBlock * blockSize : end;
  const suffixStart = hasFullBlocks ? endFullBlock * blockSize : end;

  let min = -1;
  let max = -1;
  let missing = 0;
  const scan = (from: number, to: number): void => {
    for (let sample = from; sample < to; sample += 1) {
      const value = values[sample];
      if (!Number.isFinite(value)) {
        missing += 1;
        continue;
      }
      if (min < 0 || value < values[min]) min = sample;
      if (max < 0 || value > values[max]) max = sample;
    }
  };

  scan(start, prefixEnd);
  if (hasFullBlocks) {
    let left = index.treeSize + firstFullBlock;
    let right = index.treeSize + endFullBlock;
    let treeMin = -1;
    let treeMax = -1;
    let treeMissing = 0;

    while (left < right) {
      if (left & 1) {
        treeMin = chooseIndex(values, treeMin, index.minIndex[left], 'min');
        treeMax = chooseIndex(values, treeMax, index.maxIndex[left], 'max');
        treeMissing += index.missingCount[left];
        left += 1;
      }
      if (right & 1) {
        right -= 1;
        treeMin = chooseIndex(values, treeMin, index.minIndex[right], 'min');
        treeMax = chooseIndex(values, treeMax, index.maxIndex[right], 'max');
        treeMissing += index.missingCount[right];
      }
      left = Math.floor(left / 2);
      right = Math.floor(right / 2);
    }

    min = chooseIndex(values, min, treeMin, 'min');
    max = chooseIndex(values, max, treeMax, 'max');
    missing += treeMissing;
  }
  scan(suffixStart, end);

  return { minIndex: min, maxIndex: max, missingCount: missing };
}

function collectGapAwareCandidates(
  values: Float64Array,
  start: number,
  end: number,
  limit: number,
): number[] | null {
  const candidates: number[] = [];
  let segmentStart = -1;
  let segmentMin = -1;
  let segmentMax = -1;
  let previousWasMissing = false;

  const flushSegment = (segmentEnd: number): boolean => {
    if (segmentStart < 0) return true;
    candidates.push(...uniqueSorted([segmentStart, segmentEnd, segmentMin, segmentMax]));
    segmentStart = -1;
    segmentMin = -1;
    segmentMax = -1;
    return candidates.length <= limit;
  };

  for (let sample = start; sample < end; sample += 1) {
    const value = values[sample];
    if (!Number.isFinite(value)) {
      if (!flushSegment(sample - 1)) return null;
      if (!previousWasMissing) candidates.push(sample);
      previousWasMissing = true;
    } else {
      previousWasMissing = false;
      if (segmentStart < 0) {
        segmentStart = sample;
        segmentMin = sample;
        segmentMax = sample;
      } else {
        if (value < values[segmentMin]) segmentMin = sample;
        if (value > values[segmentMax]) segmentMax = sample;
      }
    }
    if (candidates.length > limit) return null;
  }

  if (!flushSegment(end - 1)) return null;
  return uniqueSorted(candidates);
}

function chooseIndex(
  values: Float64Array,
  current: number,
  candidate: number,
  mode: 'min' | 'max',
): number {
  if (candidate < 0) return current;
  if (current < 0) return candidate;
  return mode === 'min'
    ? (values[candidate] < values[current] ? candidate : current)
    : (values[candidate] > values[current] ? candidate : current);
}

function uniqueSorted(indices: number[]): number[] {
  indices.sort((left, right) => left - right);
  let writeIndex = 0;
  for (let readIndex = 0; readIndex < indices.length; readIndex += 1) {
    const value = indices[readIndex];
    if (value < 0 || (writeIndex > 0 && indices[writeIndex - 1] === value)) continue;
    indices[writeIndex] = value;
    writeIndex += 1;
  }
  indices.length = writeIndex;
  return indices;
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
