import type { DatasetDescriptor } from '@/features/measurements/model';

export interface IngestionMetrics {
  readonly ingestionDurationMs: number;
  readonly totalBytes: number;
}

export interface ComparisonPerformanceMetrics {
  readonly retainedBytes: number;
  readonly totalRows: number;
  readonly validChannelSamples: number;
  readonly ingestionSeconds: number;
  readonly throughput: string;
  readonly ingestion: string;
  readonly memory: string;
  readonly rows: string;
}

function formatRate(value: number): string {
  return Number.isFinite(value) && value >= 0 ? `${(value / 1_000_000).toFixed(2)}M` : '—';
}

export function calculateComparisonPerformanceMetrics(
  reference: DatasetDescriptor,
  comparison: DatasetDescriptor,
  ingestion: IngestionMetrics | null,
): ComparisonPerformanceMetrics {
  const datasets = [reference, comparison];
  const retainedBytes = datasets.reduce(
    (total, dataset) => total + (dataset.retainedStorageBytes ?? 0),
    0,
  );
  const totalRows = datasets.reduce((total, dataset) => total + dataset.sampleCount, 0);
  const validChannelSamples = datasets.reduce(
    (total, dataset) =>
      total +
      dataset.channels.reduce(
        (channelTotal, channel) => channelTotal + channel.sampleCount - channel.missingSampleCount,
        0,
      ),
    0,
  );
  const ingestionSeconds = Math.max(0, ingestion?.ingestionDurationMs ?? 0) / 1_000;

  return {
    retainedBytes,
    totalRows,
    validChannelSamples,
    ingestionSeconds,
    throughput:
      ingestionSeconds > 0
        ? `${formatRate(totalRows / ingestionSeconds)} rows/s · ${formatRate(validChannelSamples / ingestionSeconds)} samples/s`
        : '—',
    ingestion: ingestion ? `${ingestionSeconds.toFixed(2)} s` : '—',
    memory: retainedBytes > 0 ? `${(retainedBytes / 1_048_576).toFixed(1)} MiB` : '—',
    rows: totalRows.toLocaleString(),
  };
}
