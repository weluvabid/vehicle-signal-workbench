import { lowerBoundFloat64 } from './sorted-search.ts';
import type { ChannelStatistics, ChannelWindow } from './model';
import type { ChannelBuffers } from './windowing';
import { Float64BufferBuilder } from './float64-buffer.ts';

export function queryChannelTimeStatistics(
  datasetId: string,
  channelId: string,
  buffers: ChannelBuffers,
  index: ChannelEnvelopeIndex,
  startSeconds: number,
  endSeconds: number,
  shouldAbort?: () => boolean,
): ChannelStatistics {
  if (
    buffers.timeSeconds.length !== buffers.values.length ||
    !Number.isFinite(startSeconds) ||
    !Number.isFinite(endSeconds) ||
    endSeconds < startSeconds
  ) {
    throw new RangeError('Invalid channel statistics time window.');
  }

  const startIndex = lowerBoundFloat64(buffers.timeSeconds, startSeconds);
  const endIndex = lowerBoundFloat64(buffers.timeSeconds, endSeconds);
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
      if (((sample - from) & 4_095) === 0 && shouldAbort?.()) {
        throw new DOMException('Viewport query superseded.', 'AbortError');
      }
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

  const extrema = queryEnvelopeSummary(buffers.values, index, startIndex, endIndex, shouldAbort);
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
    // Merge the two child aggregates directly into typed arrays. Calling the
    // general-purpose mergeStatistics helper here created temporary objects for
    // every internal node (millions across a multi-channel recording).
    const leftCount = validCount[left];
    const rightCount = validCount[right];
    const combinedCount = leftCount + rightCount;
    validCount[node] = combinedCount;

    if (leftCount === 0) {
      mean[node] = mean[right];
      sumSquaredDeviation[node] = sumSquaredDeviation[right];
    } else if (rightCount === 0) {
      mean[node] = mean[left];
      sumSquaredDeviation[node] = sumSquaredDeviation[left];
    } else {
      const delta = mean[right] - mean[left];
      const rightWeight = rightCount / combinedCount;
      mean[node] = mean[left] + delta * rightWeight;
      sumSquaredDeviation[node] =
        sumSquaredDeviation[left] +
        sumSquaredDeviation[right] +
        delta * delta * (leftCount * rightWeight);
    }
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
 * larger than 8,192 samples, or with too many transitions, collapse to a gap rather
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
  shouldAbort?: () => boolean,
): ChannelWindow;
export function queryChannelEnvelopeTimeWindow(
  datasetId: string,
  channelId: string,
  buffers: ChannelBuffers,
  index: ChannelEnvelopeIndex,
  startSeconds: number,
  endSeconds: number,
  pixelWidth: number,
  shouldAbort: (() => boolean) | undefined,
  output: { readonly timeSeconds: Float64BufferBuilder; readonly values: Float64BufferBuilder },
): null;
export function queryChannelEnvelopeTimeWindow(
  datasetId: string,
  channelId: string,
  buffers: ChannelBuffers,
  index: ChannelEnvelopeIndex,
  startSeconds: number,
  endSeconds: number,
  pixelWidth: number,
  shouldAbort?: () => boolean,
  output?: { readonly timeSeconds: Float64BufferBuilder; readonly values: Float64BufferBuilder },
): ChannelWindow | null {
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

  const startIndex = lowerBoundFloat64(buffers.timeSeconds, startSeconds);
  const endIndex = lowerBoundFloat64(buffers.timeSeconds, endSeconds);
  if (startIndex >= endIndex) {
    return output
      ? null
      : { datasetId, channelId, startIndex, timeSeconds: new Float64Array(0), values: new Float64Array(0) };
  }

  const bucketCount = Math.max(1, Math.min(pixelWidth, MAX_BUCKETS));
  const duration = endSeconds - startSeconds;
  // At most MAX_BUCKET_POINTS are retained per bucket. Numeric output stays
  // in typed buffers instead of boxing every sample in JS number arrays.
  const outputCapacity = Math.min(endIndex - startIndex, bucketCount * MAX_BUCKET_POINTS);
  const outputTimes = output?.timeSeconds ?? new Float64BufferBuilder(outputCapacity);
  const outputValues = output?.values ?? new Float64BufferBuilder(outputCapacity);
  let cursor = startIndex;

  for (let bucket = 0; bucket < bucketCount && cursor < endIndex; bucket += 1) {
    if ((bucket & 255) === 0 && shouldAbort?.()) {
      throw new DOMException('Viewport query superseded.', 'AbortError');
    }
    const bucketStart = startSeconds + duration * (bucket / bucketCount);
    const bucketEnd = bucket === bucketCount - 1
      ? endSeconds
      : startSeconds + duration * ((bucket + 1) / bucketCount);

    while (cursor < endIndex && buffers.timeSeconds[cursor] < bucketStart) {
      if (((cursor - startIndex) & 4_095) === 0 && shouldAbort?.()) {
        throw new DOMException('Viewport query superseded.', 'AbortError');
      }
      cursor += 1;
    }
    const bucketSampleStart = cursor;
    while (cursor < endIndex && buffers.timeSeconds[cursor] < bucketEnd) {
      if (((cursor - bucketSampleStart) & 4_095) === 0 && shouldAbort?.()) {
        throw new DOMException('Viewport query superseded.', 'AbortError');
      }
      cursor += 1;
    }
    const bucketSampleEnd = cursor;
    if (bucketSampleStart >= bucketSampleEnd) continue;

    const summary = queryEnvelopeSummary(
      buffers.values,
      index,
      bucketSampleStart,
      bucketSampleEnd,
      shouldAbort,
    );

    if (summary.missingCount === 0) {
      appendUniqueSortedFour(
        outputTimes, outputValues, buffers.timeSeconds, buffers.values,
        bucketSampleStart, bucketSampleEnd - 1, summary.minIndex, summary.maxIndex,
      );
      continue;
    }

    // Very large buckets with any missing samples are represented by a bounded
    // explicit gap. The indexed missing count makes this decision without
    // scanning every raw sample in a potentially multi-million-row bucket.
    // Smaller buckets are scanned so sparse dropouts retain surrounding signal.
    if (bucketSampleEnd - bucketSampleStart > 8_192) {
      appendGap(outputTimes, outputValues, buffers.timeSeconds, bucketSampleStart, bucketSampleEnd);
      continue;
    }

    const candidates = collectGapAwareCandidates(
      buffers.values,
      bucketSampleStart,
      bucketSampleEnd,
      MAX_BUCKET_POINTS,
      shouldAbort,
    );

    if (candidates === null) {
      appendGap(outputTimes, outputValues, buffers.timeSeconds, bucketSampleStart, bucketSampleEnd);
      continue;
    }

    for (const sampleIndex of candidates) {
      outputTimes.push(buffers.timeSeconds[sampleIndex]);
      const value = buffers.values[sampleIndex];
      outputValues.push(Number.isFinite(value) ? value : Number.NaN);
    }
  }

  if (output) return null;
  return {
    datasetId,
    channelId,
    startIndex,
    timeSeconds: outputTimes.finish(),
    values: outputValues.finish(),
  };
}

/** Append up to four indexes in ascending order without allocating a candidate array. */
function appendUniqueSortedFour(
  outputTimes: Float64BufferBuilder,
  outputValues: Float64BufferBuilder,
  timeSeconds: Float64Array,
  values: Float64Array,
  first: number,
  second: number,
  third: number,
  fourth: number,
): void {
  let a = first;
  let b = second;
  let c = third;
  let d = fourth;
  if (b < a) { const swap = a; a = b; b = swap; }
  if (d < c) { const swap = c; c = d; d = swap; }
  if (c < a) { const swap = a; a = c; c = swap; }
  if (d < b) { const swap = b; b = d; d = swap; }
  if (c < b) { const swap = b; b = c; c = swap; }

  let previous = -1;
  if (a >= 0) {
    outputTimes.push(timeSeconds[a]);
    outputValues.push(values[a]);
    previous = a;
  }
  if (b >= 0 && b !== previous) {
    outputTimes.push(timeSeconds[b]);
    outputValues.push(values[b]);
    previous = b;
  }
  if (c >= 0 && c !== previous) {
    outputTimes.push(timeSeconds[c]);
    outputValues.push(values[c]);
    previous = c;
  }
  if (d >= 0 && d !== previous) {
    outputTimes.push(timeSeconds[d]);
    outputValues.push(values[d]);
  }
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
  shouldAbort?: () => boolean,
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
      if (((sample - from) & 4_095) === 0 && shouldAbort?.()) {
        throw new DOMException('Viewport query superseded.', 'AbortError');
      }
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
  shouldAbort?: () => boolean,
): number[] | null {
  // Keep the bucket's outer valid samples and global extrema, plus one NaN
  // marker per missing run. This preserves the visible signal around sparse
  // dropouts without retaining every sample in a large bucket.
  let firstValid = -1;
  let lastValid = -1;
  let minIndex = -1;
  let maxIndex = -1;
  let previousWasMissing = false;
  const candidates: number[] = [];

  for (let sample = start; sample < end; sample += 1) {
    if (((sample - start) & 4_095) === 0 && shouldAbort?.()) {
      throw new DOMException('Viewport query superseded.', 'AbortError');
    }

    const value = values[sample];
    if (!Number.isFinite(value)) {
      if (!previousWasMissing) {
        candidates.push(sample);
        if (candidates.length > limit) return null;
      }
      previousWasMissing = true;
      continue;
    }

    previousWasMissing = false;
    if (firstValid < 0) firstValid = sample;
    lastValid = sample;
    if (minIndex < 0 || value < values[minIndex]) minIndex = sample;
    if (maxIndex < 0 || value > values[maxIndex]) maxIndex = sample;
  }

  if (firstValid < 0) {
    return candidates.length <= limit ? uniqueSorted(candidates) : null;
  }

  candidates.push(firstValid, lastValid, minIndex, maxIndex);
  if (candidates.length > limit) return null;
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
