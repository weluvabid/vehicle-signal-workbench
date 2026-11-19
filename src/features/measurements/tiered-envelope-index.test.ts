import assert from 'node:assert/strict';
import test from 'node:test';
import { buildChannelEnvelopeIndex, queryChannelEnvelopeTimeWindow, queryChannelTimeStatistics } from './envelope-index';
import { createTieredChannelIndex, queryTieredChannelEnvelope, queryTieredChannelStatistics } from './tiered-envelope-index';

test('tiered queries match a full index across tier boundaries and retain built tiers', () => {
  const count = 1_000;
  const timeSeconds = Float64Array.from({ length: count }, (_, index) => index);
  const values = Float64Array.from({ length: count }, (_, index) => index % 17 === 0 ? Number.NaN : Math.sin(index / 13));
  const buffers = { timeSeconds, values };
  const state = createTieredChannelIndex(count);
  // Force the progressive path for this small deterministic fixture.
  const progressive = { ...state, tierSize: 50 };
  const start = 42;
  const end = 183;
  const fullIndex = buildChannelEnvelopeIndex(values);

  const expectedWindow = queryChannelEnvelopeTimeWindow('d', 'c', buffers, fullIndex, start, end, 100);
  const actualWindow = queryTieredChannelEnvelope('d', 'c', buffers, progressive, start, end, 100);
  assert.ok(actualWindow.timeSeconds.length > 0);
  assert.equal(actualWindow.timeSeconds.length, actualWindow.values.length);
  assert.ok(actualWindow.timeSeconds.every((time, index) =>
    time >= start && time < end && (index === 0 || time >= actualWindow.timeSeconds[index - 1]),
  ));
  assert.ok(actualWindow.values.length <= expectedWindow.values.length + 8 * progressive.indexes.size * 100);

  const expectedStats = queryChannelTimeStatistics('d', 'c', buffers, fullIndex, start, end);
  const actualStats = queryTieredChannelStatistics('d', 'c', buffers, progressive, start, end);
  assert.equal(actualStats.sampleCount, expectedStats.sampleCount);
  assert.equal(actualStats.validCount, expectedStats.validCount);
  assert.equal(actualStats.missingCount, expectedStats.missingCount);
  assert.equal(actualStats.min, expectedStats.min);
  assert.equal(actualStats.max, expectedStats.max);
  assert.ok(Math.abs((actualStats.mean ?? 0) - (expectedStats.mean ?? 0)) < 1e-12);
  assert.ok(Math.abs((actualStats.standardDeviation ?? 0) - (expectedStats.standardDeviation ?? 0)) < 1e-12);

  const builtCount = progressive.indexes.size;
  queryTieredChannelEnvelope('d', 'c', buffers, progressive, start, end, 100);
  assert.equal(progressive.indexes.size, builtCount);
});


test('index-build timing is reported once per newly built tier and not on cache hits', () => {
  const count = 200;
  const timeSeconds = Float64Array.from({ length: count }, (_, index) => index);
  const values = Float64Array.from({ length: count }, (_, index) => Math.sin(index));
  const buffers = { timeSeconds, values };
  const state = { ...createTieredChannelIndex(count), tierSize: 50 };
  const buildDurations: number[] = [];
  const onIndexBuild = (durationMs: number) => buildDurations.push(durationMs);

  queryTieredChannelEnvelope('d', 'c', buffers, state, 0, 100, 64, undefined, onIndexBuild);
  assert.equal(buildDurations.length, 2);
  assert.equal(state.indexes.size, 2);

  queryTieredChannelStatistics('d', 'c', buffers, state, 0, 100, undefined, onIndexBuild);
  assert.equal(buildDurations.length, 2);
  assert.equal(state.indexes.size, 2);
});
