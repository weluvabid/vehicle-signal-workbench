import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateComparisonPerformanceMetrics } from './metrics.ts';
import type { DatasetDescriptor } from '@/features/measurements/model';

function dataset(overrides: Partial<DatasetDescriptor> = {}): DatasetDescriptor {
  return {
    id: 'dataset',
    name: 'dataset',
    sourceFileName: 'dataset.csv',
    importedAt: '2026-01-01T00:00:00.000Z',
    sampleCount: 100,
    durationSeconds: 10,
    timeOriginEpochSeconds: 0,
    timestampEncoding: 'unix-seconds',
    channels: [
      {
        id: 'speed',
        sourceColumn: 'Speed',
        label: 'Speed',
        unit: 'km/h',
        sampleCount: 100,
        missingSampleCount: 10,
      },
    ],
    retainedStorageBytes: 1024,
    ...overrides,
  };
}

test('calculates aggregate rows, samples, memory and ingestion throughput', () => {
  const result = calculateComparisonPerformanceMetrics(dataset(), dataset({ id: 'other' }), {
    ingestionDurationMs: 2_000,
    totalBytes: 400,
  });
  assert.equal(result.totalRows, 200);
  assert.equal(result.validChannelSamples, 180);
  assert.equal(result.retainedBytes, 2_048);
  assert.equal(result.ingestion, '2.00 s');
  assert.equal(result.throughput, '0.00M rows/s · 0.00M samples/s');
});

test('handles missing ingestion metrics and storage sizes', () => {
  const result = calculateComparisonPerformanceMetrics(
    dataset({ retainedStorageBytes: undefined }),
    dataset({ retainedStorageBytes: undefined }),
    null,
  );
  assert.equal(result.ingestion, '—');
  assert.equal(result.memory, '—');
  assert.equal(result.throughput, '—');
});
