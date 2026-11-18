import type { DifferenceResult } from './difference';

export interface DifferenceEnvelopeSelection {
  readonly indexes: number[];
  readonly forcedGapIndexes: ReadonlySet<number>;
}

/** Select source indexes for a min/max envelope without copying sample arrays. */
export function selectDifferenceEnvelopeIndexes(
  timeSeconds: Float64Array,
  delta: Float64Array,
  pixelWidth: number,
): DifferenceEnvelopeSelection {
  if (!Number.isInteger(pixelWidth) || pixelWidth < 1 ||
      timeSeconds.length !== delta.length) {
    throw new RangeError('Invalid difference envelope input or pixel width.');
  }
  const count = timeSeconds.length;
  if (count <= pixelWidth * 4) {
    return { indexes: Array.from({ length: count }, (_, index) => index), forcedGapIndexes: new Set() };
  }
  const firstTime = timeSeconds[0];
  const lastTime = timeSeconds[count - 1];
  const duration = lastTime - firstTime;
  if (!(duration > 0)) {
    return { indexes: Array.from({ length: count }, (_, index) => index), forcedGapIndexes: new Set() };
  }

  const indexes: number[] = [];
  const forcedGapIndexes = new Set<number>();
  let cursor = 0;
  while (cursor < count) {
    const bucket = Math.min(pixelWidth - 1, Math.floor(((timeSeconds[cursor] - firstTime) / duration) * pixelWidth));
    let end = cursor + 1;
    while (end < count && Math.min(pixelWidth - 1, Math.floor(((timeSeconds[end] - firstTime) / duration) * pixelWidth)) === bucket) end++;
    const candidates: number[] = [];
    let segmentStart = cursor;
    let gapRuns = 0;
    while (segmentStart < end) {
      const isMissing = !Number.isFinite(delta[segmentStart]);
      let segmentEnd = segmentStart + 1;
      while (segmentEnd < end && (!Number.isFinite(delta[segmentEnd])) === isMissing) segmentEnd++;
      if (isMissing) {
        gapRuns++;
        candidates.push(segmentStart);
        if (segmentEnd - 1 !== segmentStart) candidates.push(segmentEnd - 1);
      } else {
        let min = segmentStart;
        let max = segmentStart;
        for (let index = segmentStart + 1; index < segmentEnd; index++) {
          if (delta[index] < delta[min]) min = index;
          if (delta[index] > delta[max]) max = index;
        }
        candidates.push(segmentStart, min, max, segmentEnd - 1);
      }
      segmentStart = segmentEnd;
    }
    if (gapRuns > 32) {
      candidates.length = 0;
      candidates.push(cursor, end - 1);
      for (const index of candidates) {
        if (indexes[indexes.length - 1] !== index) indexes.push(index);
        forcedGapIndexes.add(index);
      }
      cursor = end;
      continue;
    }
    candidates.sort((a, b) => a - b);
    for (const index of candidates) if (indexes[indexes.length - 1] !== index) indexes.push(index);
    cursor = end;
  }
  return { indexes, forcedGapIndexes };
}

/** Min/max envelope for delta traces; retains extrema and chronological order per pixel bucket. */
export function downsampleDifferenceEnvelope(result: DifferenceResult, pixelWidth: number): DifferenceResult {
  if (!Number.isInteger(pixelWidth) || pixelWidth < 1 ||
      result.timeSeconds.length !== result.delta.length ||
      result.timeSeconds.length !== result.referenceValues.length ||
      result.timeSeconds.length !== result.comparisonValues.length) {
    throw new RangeError('Invalid difference envelope input or pixel width.');
  }
  if (result.timeSeconds.length <= pixelWidth * 4) return result;
  const { indexes, forcedGapIndexes } = selectDifferenceEnvelopeIndexes(result.timeSeconds, result.delta, pixelWidth);
  const pick = (source: Float64Array, missingForced = false) => Float64Array.from(
    indexes,
    (index) => forcedGapIndexes.has(index) && missingForced ? Number.NaN : source[index],
  );
  return {
    timeSeconds: pick(result.timeSeconds),
    referenceValues: pick(result.referenceValues, true),
    comparisonValues: pick(result.comparisonValues, true),
    delta: pick(result.delta, true),
    statistics: result.statistics,
  };
}
