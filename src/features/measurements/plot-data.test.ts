import assert from 'node:assert/strict';
import test from 'node:test';
import { buildComparisonPlotData } from './plot-data.ts';

const window = (timeSeconds: number[], values: number[]) => ({
  datasetId: 'dataset',
  channelId: 'channel',
  startIndex: 0,
  timeSeconds: new Float64Array(timeSeconds),
  values: new Float64Array(values),
});

test('keeps native samples in independent series without interpolation', () => {
  const result = buildComparisonPlotData(
    window([0, 1, 2], [10, 11, 12]),
    window([0, 0.5, 1.5], [20, 21, 22]),
    0,
  );
  assert.deepEqual(result.reference, [[0, 10], [1, 11], [2, 12]]);
  assert.deepEqual(result.comparison, [[0, 20], [0.5, 21], [1.5, 22]]);
});

test('applies the comparison offset before plotting', () => {
  const result = buildComparisonPlotData(window([1], [1]), window([0, 1], [2, 3]), 1);
  assert.deepEqual(result.comparison, [[1, 2], [2, 3]]);
});

test('converts missing and non-finite values to chart gaps', () => {
  const result = buildComparisonPlotData(
    window([0, 1, 2], [Number.NaN, Number.POSITIVE_INFINITY, 3]),
    window([0, 1], [Number.NEGATIVE_INFINITY, 4]),
    0,
  );
  assert.deepEqual(result.reference, [[0, null], [1, null], [2, 3]]);
  assert.deepEqual(result.comparison, [[0, null], [1, 4]]);
});

test('rejects non-finite offsets and malformed windows', () => {
  assert.throws(
    () => buildComparisonPlotData(window([0], [1]), window([0], [2]), Number.NaN),
    /offset must be finite/,
  );
  assert.throws(
    () => buildComparisonPlotData(window([0, 1], [1]), window([0], [2]), 0),
    /Reference time and value arrays/,
  );
});

test('rejects aligned timestamp overflow', () => {
  assert.throws(
    () => buildComparisonPlotData(window([0], [1]), window([Number.MAX_VALUE], [2]), Number.MAX_VALUE),
    /Aligned comparison timestamps must be finite/,
  );
});
