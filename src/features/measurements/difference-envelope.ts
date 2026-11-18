import type { DifferenceResult } from './difference';

/** Min/max envelope for delta traces; retains extrema and chronological order per pixel bucket. */
export function downsampleDifferenceEnvelope(result: DifferenceResult, pixelWidth: number): DifferenceResult {
  if (!Number.isInteger(pixelWidth) || pixelWidth < 1 ||
      result.timeSeconds.length !== result.delta.length ||
      result.timeSeconds.length !== result.referenceValues.length ||
      result.timeSeconds.length !== result.comparisonValues.length) {
    throw new RangeError('Invalid difference envelope input or pixel width.');
  }
  const count = result.timeSeconds.length;
  if (count <= pixelWidth * 4) return result;
  const firstTime = result.timeSeconds[0];
  const lastTime = result.timeSeconds[count - 1];
  const duration = lastTime - firstTime;
  if (!(duration > 0)) return result;
  const indexes: number[] = [];
  const forcedGapIndexes = new Set<number>();
  let cursor = 0;
  while (cursor < count) {
    const bucket = Math.min(pixelWidth - 1, Math.floor(((result.timeSeconds[cursor] - firstTime) / duration) * pixelWidth));
    let end = cursor + 1;
    while (end < count && Math.min(pixelWidth - 1, Math.floor(((result.timeSeconds[end] - firstTime) / duration) * pixelWidth)) === bucket) end++;
    const candidates: number[] = [];
    let segmentStart = cursor;
    let gapRuns = 0;
    while (segmentStart < end) {
      const isMissing = !Number.isFinite(result.delta[segmentStart]);
      let segmentEnd = segmentStart + 1;
      while (segmentEnd < end && (!Number.isFinite(result.delta[segmentEnd])) === isMissing) segmentEnd++;
      if (isMissing) {
        gapRuns++;
        candidates.push(segmentStart);
        if (segmentEnd - 1 !== segmentStart) candidates.push(segmentEnd - 1);
      } else {
        let min = segmentStart;
        let max = segmentStart;
        for (let index = segmentStart + 1; index < segmentEnd; index++) {
          if (result.delta[index] < result.delta[min]) min = index;
          if (result.delta[index] > result.delta[max]) max = index;
        }
        candidates.push(segmentStart, min, max, segmentEnd - 1);
      }
      segmentStart = segmentEnd;
    }
    if (gapRuns > 32) {
      // Highly fragmented buckets are represented as a gap rather than a misleading connected trace.
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
  const pick = (source: Float64Array, missingForced = false) => Float64Array.from(indexes, (index) => forcedGapIndexes.has(index) && missingForced ? Number.NaN : source[index]);
  return {
    timeSeconds: pick(result.timeSeconds),
    referenceValues: pick(result.referenceValues, true),
    comparisonValues: pick(result.comparisonValues, true),
    delta: pick(result.delta, true),
    statistics: result.statistics,
  };
}
