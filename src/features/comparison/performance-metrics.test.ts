import assert from 'node:assert/strict';
import test from 'node:test';
import { formatIngestionRates, summarizeIngestion } from './performance-metrics.ts';
import type { DatasetDescriptor } from '@/features/measurements/model';

function dataset(sampleCount: number, channelCount: number, missingPerChannel = 0): DatasetDescriptor {
  return {
    id: `dataset-${sampleCount}-${channelCount}`,
    name: 'fixture',
    sourceFileName: 'fixture.csv',
    importedAt: '2026-01-01T00:00:00.000Z',
    sampleCount,
    durationSeconds: 1,
    timeOriginEpochSeconds: 0,
    timestampEncoding: 'unix-seconds',
    channels: Array.from({ length: channelCount }, (_, index) => ({
      id: `channel-${index}`,
      sourceColumn: `channel-${index}`,
      label: `Channel ${index}`,
      unit: null,
      sampleCount,
      missingSampleCount: missingPerChannel,
    })),
  };
}

test('reports row throughput and actual numeric channel-sample throughput separately', () => {
  const summary = summarizeIngestion(dataset(10_000_000, 3), dataset(10_000_000, 3), {
    ingestionDurationMs: 6_530,
    totalBytes: 766.6 * 1_048_576,
  });

  assert.equal(summary.totalTimestampRows, 20_000_000);
  assert.equal(summary.totalValidChannelSamples, 60_000_000);
  assert.equal(summary.timestampRowsPerSecond, 20_000_000 / 6.53);
  assert.equal(summary.channelSamplesPerSecond, 60_000_000 / 6.53);
  assert.equal(formatIngestionRates(summary), '3.06M rows/s · 9.19M channel samples/s');
});

test('excludes missing channel cells and supports unequal run sizes', () => {
  const summary = summarizeIngestion(dataset(10, 3, 2), dataset(8, 2, 1), {
    ingestionDurationMs: 9_000,
    totalBytes: 100,
  });

  assert.equal(summary.totalTimestampRows, 18);
  assert.equal(summary.totalValidChannelSamples, 38);
  assert.equal(summary.timestampRowsPerSecond, 2);
  assert.equal(summary.channelSamplesPerSecond, 38 / 9);
});

test('does not report infinite throughput for zero-duration measurements', () => {
  const summary = summarizeIngestion(dataset(10, 1), dataset(10, 1), { ingestionDurationMs: 0, totalBytes: 20 });
  assert.equal(summary.timestampRowsPerSecond, 0);
  assert.equal(summary.channelSamplesPerSecond, 0);
});
