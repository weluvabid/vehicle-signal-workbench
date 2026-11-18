import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateSignalDifferenceSeriesInTimeRange,
  medianSampleInterval,
  type DifferenceSource,
} from './difference.ts';
import { encodeDifferenceCsvChunk, DIFFERENCE_CSV_HEADER } from './csv-export.ts';

test('chunked difference calculation preserves full-range samples and interpolation', () => {
  const referenceTime = Float64Array.from({ length: 101 }, (_, index) => index);
  const referenceValues = Float64Array.from(referenceTime, (time) => Math.sin(time / 7));
  referenceValues[17] = Number.NaN;
  referenceValues[63] = Number.NaN;

  const comparisonTime = Float64Array.from({ length: 201 }, (_, index) => index / 2);
  const comparisonValues = Float64Array.from(comparisonTime, (time) => Math.sin(time / 7) - 0.25);
  comparisonValues[40] = Number.NaN;

  const reference: DifferenceSource = {
    datasetId: 'reference', channelId: 'speed', timeSeconds: referenceTime, values: referenceValues,
  };
  const comparison: DifferenceSource = {
    datasetId: 'comparison', channelId: 'speed', timeSeconds: comparisonTime, values: comparisonValues,
  };
  const offset = 0.125;
  const cadence = medianSampleInterval(comparison);
  const expected = calculateSignalDifferenceSeriesInTimeRange(reference, comparison, 0, 100, offset, cadence);

  const actualTime: number[] = [];
  const actualReference: number[] = [];
  const actualComparison: number[] = [];
  const actualDelta: number[] = [];
  const chunkSize = 13;
  for (let startIndex = 0; startIndex < referenceTime.length; startIndex += chunkSize) {
    const endIndex = Math.min(referenceTime.length, startIndex + chunkSize);
    const startSeconds = referenceTime[startIndex];
    const endSeconds = endIndex < referenceTime.length ? referenceTime[endIndex] : 100;
    const chunk = calculateSignalDifferenceSeriesInTimeRange(
      reference, comparison, startSeconds, endSeconds, offset, cadence,
    );
    actualTime.push(...chunk.timeSeconds);
    actualReference.push(...chunk.referenceValues);
    actualComparison.push(...chunk.comparisonValues);
    actualDelta.push(...chunk.delta);
  }

  assert.deepEqual(actualTime, Array.from(expected.timeSeconds));
  assert.deepEqual(actualReference, Array.from(expected.referenceValues));
  assert.deepEqual(actualComparison, Array.from(expected.comparisonValues));
  assert.deepEqual(actualDelta, Array.from(expected.delta));
});

test('CSV chunk encoding includes one header and escapes channel metadata', () => {
  const bytes = encodeDifferenceCsvChunk('Vehicle "speed"', 'km/h, raw', {
    timeSeconds: Float64Array.of(0, 1),
    referenceValues: Float64Array.of(10, Number.NaN),
    comparisonValues: Float64Array.of(9, Number.NaN),
    delta: Float64Array.of(1, Number.NaN),
    statistics: {
      policyVersion: 1,
      direction: 'reference-minus-comparison',
      matchedCount: 1,
      unavailableCount: 1,
      bias: 1,
      meanAbsoluteError: 1,
      rootMeanSquareError: 1,
      maximumAbsoluteError: 1,
      maxInterpolationGapSeconds: 1,
    },
  }, true);

  const csv = new TextDecoder().decode(bytes);
  const lines = csv.trimEnd().split('\r\n');
  assert.equal(lines[0], DIFFERENCE_CSV_HEADER);
  assert.equal(lines.length, 3);
  assert.match(lines[1], /^"Vehicle ""speed""","km\/h, raw"/);
  assert.equal(lines[2], '"Vehicle ""speed""","km/h, raw","1","","","","false"');
});
