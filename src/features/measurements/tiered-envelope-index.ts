import { Float64BufferBuilder } from './float64-buffer.ts';
import { lowerBoundFloat64 } from './sorted-search.ts';
import {
  buildChannelEnvelopeIndex,
  queryChannelEnvelopeTimeWindow,
  queryChannelTimeStatistics,
  type ChannelEnvelopeIndex,
} from './envelope-index.ts';
import type { ChannelStatistics, ChannelWindow } from './model';
import type { ChannelBuffers } from './windowing';

export const INDEX_TIER_FRACTION = 0.05;
export const EAGER_INDEX_SAMPLE_THRESHOLD = 250_000;

export interface TieredChannelIndex {
  readonly sampleCount: number;
  readonly tierSize: number;
  readonly indexes: Map<number, ChannelEnvelopeIndex>;
}

export function createTieredChannelIndex(sampleCount: number): TieredChannelIndex {
  const tierSize = sampleCount <= EAGER_INDEX_SAMPLE_THRESHOLD
    ? Math.max(1, sampleCount)
    : Math.max(1, Math.ceil(sampleCount * INDEX_TIER_FRACTION));
  return { sampleCount, tierSize, indexes: new Map() };
}

function ensureTier(
  state: TieredChannelIndex,
  values: Float64Array,
  tier: number,
  onIndexBuild?: (durationMs: number) => void,
): ChannelEnvelopeIndex {
  const existing = state.indexes.get(tier);
  if (existing) return existing;
  const start = tier * state.tierSize;
  const end = Math.min(state.sampleCount, start + state.tierSize);
  const buildStartedAt = performance.now();
  const built = buildChannelEnvelopeIndex(values.subarray(start, end));
  onIndexBuild?.(performance.now() - buildStartedAt);
  // Publish only after the complete index has been built.
  state.indexes.set(tier, built);
  return built;
}

export function buildAllChannelIndexTiers(state: TieredChannelIndex, values: Float64Array): void {
  const tierCount = Math.ceil(state.sampleCount / state.tierSize);
  for (let tier = 0; tier < tierCount; tier += 1) ensureTier(state, values, tier);
}

function overlappingTiers(timeSeconds: Float64Array, start: number, end: number, tierSize: number) {
  const first = lowerBoundFloat64(timeSeconds, start);
  const afterLast = lowerBoundFloat64(timeSeconds, end);
  if (first >= afterLast) return { first, afterLast, firstTier: 0, lastTier: -1 };
  return {
    first,
    afterLast,
    firstTier: Math.floor(first / tierSize),
    lastTier: Math.floor((afterLast - 1) / tierSize),
  };
}

export function queryTieredChannelEnvelope(
  datasetId: string,
  channelId: string,
  buffers: ChannelBuffers,
  state: TieredChannelIndex,
  startSeconds: number,
  endSeconds: number,
  pixelWidth: number,
  shouldAbort?: () => boolean,
  onIndexBuild?: (durationMs: number) => void,
): ChannelWindow {
  const range = overlappingTiers(buffers.timeSeconds, startSeconds, endSeconds, state.tierSize);
  if (range.lastTier < range.firstTier) {
    return { datasetId, channelId, startIndex: range.first, timeSeconds: new Float64Array(0), values: new Float64Array(0) };
  }

  const tierCount = range.lastTier - range.firstTier + 1;
  const outputCapacity = Math.min(range.afterLast - range.first, Math.max(1, pixelWidth) * 8);
  const outputTimes = new Float64BufferBuilder(outputCapacity);
  const outputValues = new Float64BufferBuilder(outputCapacity);
  const output = { timeSeconds: outputTimes, values: outputValues };
  for (let tier = range.firstTier; tier <= range.lastTier; tier += 1) {
    if (shouldAbort?.()) throw new DOMException('Viewport query superseded.', 'AbortError');
    const startIndex = tier * state.tierSize;
    const endIndex = Math.min(state.sampleCount, startIndex + state.tierSize);
    const index = ensureTier(state, buffers.values, tier, onIndexBuild);
    queryChannelEnvelopeTimeWindow(
      datasetId, channelId,
      {
        timeSeconds: buffers.timeSeconds.subarray(startIndex, endIndex),
        values: buffers.values.subarray(startIndex, endIndex),
      },
      index, startSeconds, endSeconds, Math.max(1, Math.ceil(pixelWidth / tierCount)), shouldAbort, output,
    );
  }
  return {
    datasetId, channelId, startIndex: range.first,
    timeSeconds: outputTimes.finish(), values: outputValues.finish(),
  };
}

export function queryTieredChannelStatistics(
  datasetId: string,
  channelId: string,
  buffers: ChannelBuffers,
  state: TieredChannelIndex,
  startSeconds: number,
  endSeconds: number,
  shouldAbort?: () => boolean,
  onIndexBuild?: (durationMs: number) => void,
): ChannelStatistics {
  const range = overlappingTiers(buffers.timeSeconds, startSeconds, endSeconds, state.tierSize);
  if (range.lastTier < range.firstTier) {
    return { datasetId, channelId, startIndex: range.first, endIndex: range.afterLast, sampleCount: 0,
      validCount: 0, missingCount: 0, min: null, max: null, mean: null, standardDeviation: null };
  }

  let count = 0;
  let mean = 0;
  let m2 = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let tier = range.firstTier; tier <= range.lastTier; tier += 1) {
    if (shouldAbort?.()) throw new DOMException('Viewport query superseded.', 'AbortError');
    const startIndex = tier * state.tierSize;
    const endIndex = Math.min(state.sampleCount, startIndex + state.tierSize);
    const index = ensureTier(state, buffers.values, tier, onIndexBuild);
    const stats = queryChannelTimeStatistics(
      datasetId, channelId,
      {
        timeSeconds: buffers.timeSeconds.subarray(startIndex, endIndex),
        values: buffers.values.subarray(startIndex, endIndex),
      },
      index, startSeconds, endSeconds, shouldAbort,
    );
    if (stats.validCount === 0) continue;
    const nextM2 = (stats.standardDeviation ?? 0) ** 2 * stats.validCount;
    if (count === 0) {
      count = stats.validCount; mean = stats.mean ?? 0; m2 = nextM2;
    } else {
      const combined = count + stats.validCount;
      const delta = (stats.mean ?? 0) - mean;
      m2 += nextM2 + delta * delta * count * stats.validCount / combined;
      mean += delta * stats.validCount / combined;
      count = combined;
    }
    min = Math.min(min, stats.min ?? Number.POSITIVE_INFINITY);
    max = Math.max(max, stats.max ?? Number.NEGATIVE_INFINITY);
  }
  const sampleCount = range.afterLast - range.first;
  return {
    datasetId, channelId, startIndex: range.first, endIndex: range.afterLast,
    sampleCount, validCount: count, missingCount: sampleCount - count,
    min: count === 0 ? null : min, max: count === 0 ? null : max,
    mean: count === 0 ? null : mean,
    standardDeviation: count === 0 ? null : Math.sqrt(m2 / count),
  };
}

export function getTieredIndexBytes(state: TieredChannelIndex): number {
  let bytes = 0;
  for (const index of state.indexes.values()) {
    bytes += index.minIndex.byteLength + index.maxIndex.byteLength + index.missingCount.byteLength +
      index.validCount.byteLength + index.mean.byteLength + index.sumSquaredDeviation.byteLength;
  }
  return bytes;
}
