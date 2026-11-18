import type { DatasetDescriptor } from '@/features/measurements/model';

export interface IngestionPerformanceMetrics {
  readonly durationMs: number;
  readonly totalBytes: number;
}

export interface IngestionPerformanceSummary {
  readonly referenceSamples: number;
  readonly comparisonSamples: number;
  readonly totalTimestampRows: number;
  readonly totalValidChannelSamples: number;
  readonly timestampRowsPerSecond: number;
  readonly channelSamplesPerSecond: number;
  readonly durationMs: number;
  readonly totalBytes: number;
}

/**
 * Dataset sampleCount is timestamp rows. Each numeric channel contributes one
 * channel sample per row, except cells explicitly counted as missing. Both
 * throughput rates use the concurrent two-file wall-clock import duration.
 */
export function summarizeIngestion(
  reference: DatasetDescriptor,
  comparison: DatasetDescriptor,
  metrics: IngestionPerformanceMetrics,
): IngestionPerformanceSummary {
  const totalTimestampRows = reference.sampleCount + comparison.sampleCount;
  const totalValidChannelSamples = [reference, comparison].reduce(
    (total, dataset) => total + dataset.channels.reduce(
      (channelTotal, channel) => channelTotal + channel.sampleCount - channel.missingSampleCount,
      0,
    ),
    0,
  );
  const durationSeconds = metrics.durationMs / 1_000;

  return {
    referenceSamples: reference.sampleCount,
    comparisonSamples: comparison.sampleCount,
    totalTimestampRows,
    totalValidChannelSamples,
    timestampRowsPerSecond: durationSeconds > 0 ? totalTimestampRows / durationSeconds : 0,
    channelSamplesPerSecond: durationSeconds > 0 ? totalValidChannelSamples / durationSeconds : 0,
    durationMs: metrics.durationMs,
    totalBytes: metrics.totalBytes,
  };
}

function formatRate(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '—';
  return `${(value / 1_000_000).toFixed(2)}M`;
}

export function formatIngestionRates(summary: IngestionPerformanceSummary): string {
  return `${formatRate(summary.timestampRowsPerSecond)} rows/s · ${formatRate(summary.channelSamplesPerSecond)} channel samples/s`;
}
