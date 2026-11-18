import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateSignalDifference, calculateSignalDifferenceInTimeRange, calculateSignalDifferenceSeriesInTimeRange, downsampleDifferenceEnvelope, medianSampleInterval } from './difference.ts';

const window = (time: number[], values: number[]) => ({
  datasetId: 'dataset', channelId: 'channel', startIndex: 0,
  timeSeconds: new Float64Array(time), values: new Float64Array(values),
});

test('computes reference-minus-comparison using exact samples', () => {
  const result = calculateSignalDifference(window([0, 1, 2], [12, 14, 16]), window([0, 1, 2], [10, 10, 10]), 0);
  assert.deepEqual([...result.delta], [2, 4, 6]);
  assert.equal(result.statistics.bias, 4);
  assert.equal(result.statistics.meanAbsoluteError, 4);
  assert.ok(Math.abs((result.statistics.rootMeanSquareError ?? 0) - Math.sqrt(56 / 3)) < 1e-12);
  assert.equal(result.statistics.maximumAbsoluteError, 6);
  assert.equal(result.statistics.matchedCount, 3);
});

test('linearly interpolates comparison at reference timestamps', () => {
  const result = calculateSignalDifference(window([0, 0.5, 1], [10, 10, 10]), window([0, 1], [2, 4]), 0);
  assert.deepEqual([...result.delta], [8, 7, 6]);
  assert.equal(result.statistics.matchedCount, 3);
});

test('applies timeline offset before interpolation', () => {
  const result = calculateSignalDifference(window([1, 2], [10, 10]), window([0, 1], [3, 4]), 1);
  assert.deepEqual([...result.delta], [7, 6]);
});

test('does not extrapolate outside comparison coverage', () => {
  const result = calculateSignalDifference(window([-1, 0, 1, 2], [5, 5, 5, 5]), window([0, 1], [1, 1]), 0);
  assert.ok(Number.isNaN(result.delta[0]));
  assert.ok(Number.isNaN(result.delta[3]));
  assert.equal(result.statistics.matchedCount, 2);
  assert.equal(result.statistics.unavailableCount, 2);
});

test('does not interpolate across missing samples', () => {
  const result = calculateSignalDifference(window([0, 0.5, 1, 1.5, 2], [4, 4, 4, 4, 4]), window([0, 1, 2], [1, Number.NaN, 1]), 0);
  assert.deepEqual([...result.delta].map(Number.isNaN), [false, true, true, true, false]);
  assert.equal(result.statistics.matchedCount, 2);
});

test('rejects interpolation over a gap larger than 2.5 median intervals', () => {
  const result = calculateSignalDifference(
    window([0, 1, 2, 3, 6, 10], [5, 5, 5, 5, 5, 5]),
    window([0, 1, 2, 3, 10], [1, 1, 1, 1, 1]),
    0,
  );
  assert.equal(result.statistics.matchedCount, 5);
  assert.ok(Number.isNaN(result.delta[4]));
});

test('matches exact samples even when cadence cannot be estimated', () => {
  const result = calculateSignalDifference(window([0], [7]), window([0], [2]), 0);
  assert.deepEqual([...result.delta], [5]);
  assert.equal(result.statistics.matchedCount, 1);
  assert.equal(result.statistics.maxInterpolationGapSeconds, null);
});

test('uses the full-run cadence to reject a locally sparse interpolation bracket', () => {
  const result = calculateSignalDifference(
    window([6], [5]),
    window([3, 10], [1, 1]),
    0,
    1,
  );
  assert.equal(result.statistics.matchedCount, 0);
  assert.ok(Number.isNaN(result.delta[0]));
  assert.equal(result.statistics.maxInterpolationGapSeconds, 2.5);
});

test('returns unavailable metrics when no comparison samples can be matched', () => {
  const result = calculateSignalDifference(window([0, 1], [2, 3]), window([], []), 0);
  assert.equal(result.statistics.bias, null);
  assert.equal(result.statistics.rootMeanSquareError, null);
  assert.equal(result.statistics.matchedCount, 0);
});

test('calculates a visible range directly from source buffers without copying source windows', () => {
  const reference = { datasetId: 'r', channelId: 'rpm', timeSeconds: new Float64Array([0, 1, 2, 3]), values: new Float64Array([12, 12, 12, 12]) };
  const comparison = { datasetId: 'c', channelId: 'rpm', timeSeconds: new Float64Array([0, 1, 2, 3]), values: new Float64Array([10, 10, 10, 10]) };
  const statistics = calculateSignalDifferenceInTimeRange(reference, comparison, 1, 3, 0);
  assert.equal(statistics.matchedCount, 2);
  assert.equal(statistics.bias, 2);
  assert.equal(statistics.maximumAbsoluteError, 2);
});

test('calculates median cadence from adjacent finite samples', () => {
  assert.equal(medianSampleInterval(window([0, 1, 2, 4], [1, 2, Number.NaN, 4])), 1);
});

test('keeps RMSE and MAE finite for large but representable differences', () => {
  const result = calculateSignalDifference(
    window([0, 1], [1e308, 1e308]),
    window([0, 1], [0, 0]),
    0,
  );
  assert.equal(result.statistics.meanAbsoluteError, 1e308);
  assert.equal(result.statistics.rootMeanSquareError, 1e308);
  assert.equal(result.statistics.maximumAbsoluteError, 1e308);
});

test('rejects malformed and non-monotonic inputs', () => {
  assert.throws(() => calculateSignalDifference(window([1, 0], [1, 2]), window([0, 1], [1, 2]), 0), /strictly increasing/);
  assert.throws(() => calculateSignalDifference(window([0], [1]), window([0], [1]), Number.POSITIVE_INFINITY), /offset must be finite/);
});


test('returns reference, interpolated comparison and delta series for CSV and plotting', () => {
  const result = calculateSignalDifferenceSeriesInTimeRange(
    { datasetId: 'r', channelId: 'rpm', timeSeconds: new Float64Array([0, 0.5, 1]), values: new Float64Array([10, 10, 10]) },
    { datasetId: 'c', channelId: 'rpm', timeSeconds: new Float64Array([0, 1]), values: new Float64Array([2, 4]) },
    0, 1.1, 0,
  );
  assert.deepEqual([...result.referenceValues], [10, 10, 10]);
  assert.deepEqual([...result.comparisonValues], [2, 3, 4]);
  assert.deepEqual([...result.delta], [8, 7, 6]);
});

test('downsamples difference traces while retaining narrow positive and negative extrema', () => {
  const times = Float64Array.from({ length: 1_000 }, (_, index) => index / 100);
  const reference = new Float64Array(1_000).fill(0);
  const comparison = new Float64Array(1_000).fill(0);
  comparison[417] = -125;
  comparison[812] = 240;
  const result = calculateSignalDifference(
    { ...window([...times], [...reference]), timeSeconds: times, values: reference },
    { ...window([...times], [...comparison]), timeSeconds: times, values: comparison },
    0,
  );
  const reduced = downsampleDifferenceEnvelope(result, 40);
  assert.ok(reduced.delta.length <= 160);
  assert.ok([...reduced.delta].includes(125));
  assert.ok([...reduced.delta].includes(-240));
  assert.equal(reduced.statistics.matchedCount, 1_000);
});

test('preserves missing-data gaps in downsampled difference traces', () => {
  const result = calculateSignalDifference(
    window([0, 1, 2, 3, 4, 5, 6, 7], [2, 2, 2, 2, 2, 2, 2, 2]),
    window([0, 1, 2, 3, 4, 5, 6, 7], [1, 1, Number.NaN, Number.NaN, Number.NaN, 1, 1, 1]),
    0,
  );
  const reduced = downsampleDifferenceEnvelope(result, 1);
  assert.ok([...reduced.delta].some(Number.isNaN));
});


test('difference series uses full-run cadence rather than a locally sparse viewport cadence', () => {
  const result = calculateSignalDifferenceSeriesInTimeRange(
    { datasetId: 'r', channelId: 'rpm', timeSeconds: new Float64Array([6]), values: new Float64Array([5]) },
    { datasetId: 'c', channelId: 'rpm', timeSeconds: new Float64Array([0, 1, 2, 3, 10]), values: new Float64Array([1, 1, 1, 1, 1]) },
    6, 7, 0,
  );
  assert.equal(result.statistics.matchedCount, 0);
  assert.ok(Number.isNaN(result.delta[0]));
});
