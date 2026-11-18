import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateChannelStatistics,
  queryChannelWindow,
  queryChannelTimeWindow,
  queryChannelTimeStatistics,
  buildChannelEnvelopeIndex,
  queryChannelEnvelopeTimeWindow,
} from './windowing.ts';

test('returns an isolated sample window with matching time values', () => {
  const times = Float64Array.from([0, 0.1, 0.2, 0.3, 0.4]);
  const values = Float64Array.from([10, 11, 12, 13, 14]);
  const window = queryChannelWindow(
    'dataset-a',
    'rpm',
    { timeSeconds: times, values },
    1,
    4,
  );

  assert.deepEqual([...window.timeSeconds], [0.1, 0.2, 0.3]);
  assert.deepEqual([...window.values], [11, 12, 13]);
  assert.equal(window.startIndex, 1);

  window.values[0] = -100;
  assert.equal(values[1], 11);
});

test('rejects out-of-bounds or mismatched buffers', () => {
  const times = Float64Array.from([0, 1]);
  const values = Float64Array.from([1, 2]);
  assert.throws(
    () => queryChannelWindow('d', 'c', { timeSeconds: times, values }, -1, 1),
    RangeError,
  );
  assert.throws(
    () => queryChannelWindow('d', 'c', {
      timeSeconds: times,
      values: Float64Array.from([1]),
    }, 0, 1),
    RangeError,
  );
});

test('computes stable statistics while excluding NaN and infinite samples', () => {
  const values = Float64Array.from([1, 2, Number.NaN, 3, Number.POSITIVE_INFINITY, 4]);
  const stats = calculateChannelStatistics('d', 'c', values, 0, values.length);

  assert.equal(stats.sampleCount, 6);
  assert.equal(stats.validCount, 4);
  assert.equal(stats.missingCount, 2);
  assert.equal(stats.min, 1);
  assert.equal(stats.max, 4);
  assert.equal(stats.mean, 2.5);
  assert.equal(stats.standardDeviation, Math.sqrt(1.25));
});

test('returns null statistics for a range with no valid samples', () => {
  const values = Float64Array.from([Number.NaN, Number.POSITIVE_INFINITY]);
  const stats = calculateChannelStatistics('d', 'c', values, 0, 2);

  assert.equal(stats.validCount, 0);
  assert.equal(stats.min, null);
  assert.equal(stats.max, null);
  assert.equal(stats.mean, null);
  assert.equal(stats.standardDeviation, null);
});

test('rejects invalid statistics ranges', () => {
  assert.throws(
    () => calculateChannelStatistics('d', 'c', Float64Array.from([1]), 0, 2),
    RangeError,
  );
});


test('queries a half-open time window with binary-searched sample bounds', () => {
  const result = queryChannelTimeWindow('dataset', 'channel', {
    timeSeconds: new Float64Array([0, 0.5, 1, 1.5, 2]),
    values: new Float64Array([10, 20, 30, 40, 50]),
  }, 0.5, 2);
  assert.equal(result.startIndex, 1);
  assert.deepEqual([...result.timeSeconds], [0.5, 1, 1.5]);
  assert.deepEqual([...result.values], [20, 30, 40]);
});


function envelopeQuery(times: number[], values: number[], start: number, end: number, width: number) {
  const timeSeconds = Float64Array.from(times);
  const channelValues = Float64Array.from(values);
  return queryChannelEnvelopeTimeWindow(
    'dataset',
    'channel',
    { timeSeconds, values: channelValues },
    buildChannelEnvelopeIndex(channelValues),
    start,
    end,
    width,
  );
}

test('min/max envelope preserves narrow positive and negative peaks within a pixel bucket', () => {
  const values = Array.from({ length: 1_000 }, (_, index) => Math.sin(index / 20));
  values[421] = 100;
  values[733] = -100;
  const result = envelopeQuery(
    Array.from({ length: 1_000 }, (_, index) => index / 10),
    values,
    0,
    100,
    10,
  );

  assert.ok(result.values.includes(100));
  assert.ok(result.values.includes(-100));
  assert.ok(result.values.length <= 40);
});

test('envelope query only returns samples inside the requested half-open time range', () => {
  const result = envelopeQuery([0, 1, 2, 3, 4, 5], [1, 2, 3, 4, 5, 6], 1, 5, 2);
  assert.ok([...result.timeSeconds].every((time) => time >= 1 && time < 5));
  assert.equal(result.startIndex, 1);
});

test('envelope preserves a small missing-data gap instead of connecting across it', () => {
  const result = envelopeQuery(
    [0, 1, 2, 3, 4, 5, 6, 7],
    [1, 2, 3, Number.NaN, 5, 6, 7, 8],
    0,
    8,
    1,
  );
  assert.ok([...result.values].some(Number.isNaN));
  assert.equal(result.values.length, 5);
});

test('pathological missing transitions collapse to a bounded explicit gap', () => {
  const values = Array.from({ length: 128 }, (_, index) => index % 2 ? Number.NaN : index);
  const result = envelopeQuery(
    Array.from({ length: values.length }, (_, index) => index),
    values,
    0,
    128,
    1,
  );
  assert.deepEqual([...result.values].map(Number.isNaN), [true, true]);
  assert.equal(result.values.length, 2);
});

test('envelope query rejects invalid pixel widths and time ranges', () => {
  const times = Float64Array.from([0, 1]);
  const values = Float64Array.from([1, 2]);
  const index = buildChannelEnvelopeIndex(values);
  assert.throws(() => queryChannelEnvelopeTimeWindow('d', 'c', { timeSeconds: times, values }, index, 0, 1, 0), RangeError);
  assert.throws(() => queryChannelEnvelopeTimeWindow('d', 'c', { timeSeconds: times, values }, index, 2, 1, 10), RangeError);
});

test('one-million-sample envelope stays bounded by viewport width and retains isolated extrema', () => {
  const sampleCount = 1_000_000;
  const times = new Float64Array(sampleCount);
  const values = new Float64Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    times[index] = index / 1_000;
    values[index] = Math.sin(index / 37);
  }
  values[123_456] = 250;
  values[876_543] = -250;

  const index = buildChannelEnvelopeIndex(values);
  const result = queryChannelEnvelopeTimeWindow(
    'large-dataset',
    'large-channel',
    { timeSeconds: times, values },
    index,
    0,
    sampleCount / 1_000,
    800,
  );

  assert.ok(result.values.includes(250));
  assert.ok(result.values.includes(-250));
  assert.ok(result.values.length <= 800 * 4);
});


test('large buckets containing missing samples collapse to a bounded gap without scanning raw samples', () => {
  const sampleCount = 100_000;
  const times = Float64Array.from({ length: sampleCount }, (_, index) => index);
  const values = new Float64Array(sampleCount).fill(5);
  values[50_000] = Number.NaN;
  const index = buildChannelEnvelopeIndex(values);
  const result = queryChannelEnvelopeTimeWindow(
    'dataset', 'channel', { timeSeconds: times, values }, index, 0, sampleCount, 1,
  );
  assert.equal(result.values.length, 2);
  assert.ok([...result.values].every(Number.isNaN));
});


test('computes statistics over a half-open time interval without including the end sample', () => {
  const buffers = {
    timeSeconds: new Float64Array([0, 0.5, 1, 1.5, 2]),
    values: new Float64Array([10, 20, Number.NaN, 40, 50]),
  };
  const statistics = queryChannelTimeStatistics(
    'd', 'c', buffers, buildChannelEnvelopeIndex(buffers.values), 0.5, 2,
  );

  assert.equal(statistics.startIndex, 1);
  assert.equal(statistics.endIndex, 4);
  assert.equal(statistics.sampleCount, 3);
  assert.equal(statistics.validCount, 2);
  assert.equal(statistics.missingCount, 1);
  assert.equal(statistics.min, 20);
  assert.equal(statistics.max, 40);
  assert.equal(statistics.mean, 30);
});

test('returns empty statistics when a visible time interval contains no samples', () => {
  const buffers = {
    timeSeconds: new Float64Array([0, 1, 2]),
    values: new Float64Array([10, 20, 30]),
  };
  const statistics = queryChannelTimeStatistics(
    'd', 'c', buffers, buildChannelEnvelopeIndex(buffers.values), 0.25, 0.75,
  );

  assert.equal(statistics.sampleCount, 0);
  assert.equal(statistics.validCount, 0);
  assert.equal(statistics.min, null);
  assert.equal(statistics.max, null);
  assert.equal(statistics.mean, null);
});

test('rejects malformed time axes and invalid statistics intervals', () => {
  const malformed = { timeSeconds: new Float64Array([0, 1]), values: new Float64Array([1]) };
  assert.throws(() => queryChannelTimeStatistics('d', 'c', malformed, buildChannelEnvelopeIndex(malformed.values), 0, 1), RangeError);
  const valid = { timeSeconds: new Float64Array([0, 1]), values: new Float64Array([1, 2]) };
  assert.throws(() => queryChannelTimeStatistics('d', 'c', valid, buildChannelEnvelopeIndex(valid.values), 2, 1), RangeError);
});


test('indexed visible-window statistics match a direct Welford scan across block boundaries', () => {
  const sampleCount = 25_003;
  const timeSeconds = new Float64Array(sampleCount);
  const values = new Float64Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    timeSeconds[index] = index * 0.01;
    values[index] = 1_000_000 + Math.sin(index / 17) * 0.125;
    if (index % 97 === 0) values[index] = Number.NaN;
  }
  const buffers = { timeSeconds, values };
  const index = buildChannelEnvelopeIndex(values);

  for (const [start, end] of [[0, 0.64], [0.01, 1.27], [15.35, 190.42], [210, 250.02]] as const) {
    const actual = queryChannelTimeStatistics('d', 'c', buffers, index, start, end);
    const expected = calculateChannelStatistics('d', 'c', values, actual.startIndex, actual.endIndex);
    assert.equal(actual.sampleCount, expected.sampleCount);
    assert.equal(actual.validCount, expected.validCount);
    assert.equal(actual.missingCount, expected.missingCount);
    assert.equal(actual.min, expected.min);
    assert.equal(actual.max, expected.max);
    assert.ok(Math.abs((actual.mean ?? 0) - (expected.mean ?? 0)) < 1e-8);
    assert.ok(Math.abs((actual.standardDeviation ?? 0) - (expected.standardDeviation ?? 0)) < 1e-8);
  }
});
