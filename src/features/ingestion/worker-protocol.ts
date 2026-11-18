import type { DifferencePlotResult } from '../measurements/difference';
import type { ChannelStatistics, ChannelWindow, CsvImportOptions, DatasetDescriptor } from '../measurements/model';

export interface ComparisonPanelQueryResult {
  readonly referenceWindow: ChannelWindow;
  readonly comparisonWindow: ChannelWindow;
  readonly referenceStatistics: ChannelStatistics;
  readonly comparisonStatistics: ChannelStatistics;
  readonly differenceSeries: DifferencePlotResult;
}

export interface ComparisonPanelQuery {
  readonly referenceChannelId: string;
  readonly comparisonChannelId: string;
}

export interface ComparisonBatchQueryResult {
  readonly panels: readonly ComparisonPanelQueryResult[];
}

export type IngestionRequest =
  | { readonly type: 'import'; readonly requestId: number; readonly file: File; readonly options: CsvImportOptions }
  | { readonly type: 'cancel'; readonly requestId: number }
  | { readonly type: 'release'; readonly datasetId: string }
  | { readonly type: 'query-comparison-batch'; readonly requestId: number; readonly referenceDatasetId: string; readonly comparisonDatasetId: string; readonly panels: readonly ComparisonPanelQuery[]; readonly cancelBuffer?: SharedArrayBuffer; readonly startSeconds: number; readonly endSeconds: number; readonly comparisonOffsetSeconds: number; readonly pixelWidth: number };

export type WorkerErrorCode =
  | 'EMPTY_FILE' | 'INVALID_CSV' | 'MISSING_TIMESTAMP_COLUMN' | 'INVALID_TIMESTAMP'
  | 'NON_MONOTONIC_TIMESTAMP' | 'NO_NUMERIC_CHANNELS' | 'NO_VALID_SAMPLES'
  | 'IMPORT_CANCELLED' | 'DIFFERENCE_INPUT_NOT_FOUND' | 'INVALID_DIFFERENCE_QUERY'
  | 'DATASET_NOT_FOUND' | 'CHANNEL_NOT_FOUND' | 'INVALID_QUERY';

export type IngestionResponse =
  | { readonly type: 'progress'; readonly requestId: number; readonly fraction: number }
  | { readonly type: 'complete'; readonly requestId: number; readonly dataset: DatasetDescriptor }
  | { readonly type: 'comparison-batch'; readonly requestId: number; readonly result: ComparisonBatchQueryResult }
  | { readonly type: 'cancelled'; readonly requestId: number }
  | { readonly type: 'error'; readonly requestId: number; readonly code: WorkerErrorCode; readonly message: string };
