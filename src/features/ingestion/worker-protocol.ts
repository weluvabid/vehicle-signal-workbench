import type { DifferencePlotResult, DifferenceResult, DifferenceStatistics } from '../measurements/difference';
import type {
  ChannelStatistics,
  ChannelWindow,
  CsvImportOptions,
  DatasetDescriptor,
} from '../measurements/model';

export interface CsvExportChannel {
  readonly referenceChannelId: string;
  readonly comparisonChannelId: string;
  readonly label: string;
  readonly unit: string;
}

export interface ComparisonPanelQueryResult {
  readonly referenceWindow: ChannelWindow;
  readonly comparisonWindow: ChannelWindow;
  readonly referenceStatistics: ChannelStatistics;
  readonly comparisonStatistics: ChannelStatistics;
  readonly differenceSeries: DifferencePlotResult;
}

export type IngestionRequest =
  | { readonly type: 'import'; readonly requestId: number; readonly file: File; readonly options: CsvImportOptions }
  | { readonly type: 'cancel'; readonly requestId: number }
  | { readonly type: 'cancel-csv-export'; readonly requestId: number }
  | { readonly type: 'ack-csv-export-chunk'; readonly requestId: number }
  | { readonly type: 'export-difference-csv'; readonly requestId: number; readonly referenceDatasetId: string; readonly comparisonDatasetId: string; readonly channels: readonly CsvExportChannel[]; readonly startSeconds: number; readonly endSeconds: number; readonly comparisonOffsetSeconds: number; }
  | { readonly type: 'release'; readonly datasetId: string }
  | { readonly type: 'query-window'; readonly requestId: number; readonly datasetId: string; readonly channelId: string; readonly startIndex: number; readonly endIndex: number }
  | { readonly type: 'query-time-window'; readonly requestId: number; readonly datasetId: string; readonly channelId: string; readonly startSeconds: number; readonly endSeconds: number }
  | { readonly type: 'query-envelope-time-window'; readonly requestId: number; readonly datasetId: string; readonly channelId: string; readonly startSeconds: number; readonly endSeconds: number; readonly pixelWidth: number }
  | { readonly type: 'query-statistics'; readonly requestId: number; readonly datasetId: string; readonly channelId: string; readonly startIndex: number; readonly endIndex: number }
  | { readonly type: 'query-time-statistics'; readonly requestId: number; readonly datasetId: string; readonly channelId: string; readonly startSeconds: number; readonly endSeconds: number }
  | { readonly type: 'query-difference-series'; readonly requestId: number; readonly referenceDatasetId: string; readonly referenceChannelId: string; readonly comparisonDatasetId: string; readonly comparisonChannelId: string; readonly startSeconds: number; readonly endSeconds: number; readonly comparisonOffsetSeconds: number; readonly pixelWidth: number }
  | { readonly type: 'query-difference-statistics'; readonly requestId: number; readonly referenceDatasetId: string; readonly referenceChannelId: string; readonly comparisonDatasetId: string; readonly comparisonChannelId: string; readonly startSeconds: number; readonly endSeconds: number; readonly comparisonOffsetSeconds: number }
  | { readonly type: 'query-comparison-panel'; readonly requestId: number; readonly referenceDatasetId: string; readonly referenceChannelId: string; readonly comparisonDatasetId: string; readonly comparisonChannelId: string; readonly startSeconds: number; readonly endSeconds: number; readonly comparisonOffsetSeconds: number; readonly pixelWidth: number };

export type WorkerErrorCode =
  | 'EMPTY_FILE'
  | 'INVALID_CSV'
  | 'MISSING_TIMESTAMP_COLUMN'
  | 'INVALID_TIMESTAMP'
  | 'NON_MONOTONIC_TIMESTAMP'
  | 'NO_NUMERIC_CHANNELS'
  | 'NO_VALID_SAMPLES'
  | 'IMPORT_CANCELLED'
  | 'DIFFERENCE_INPUT_NOT_FOUND'
  | 'INVALID_DIFFERENCE_QUERY'
  | 'DATASET_NOT_FOUND'
  | 'CHANNEL_NOT_FOUND'
  | 'INVALID_QUERY'
  | 'EXPORT_FAILED';

export type IngestionResponse =
  | { readonly type: 'progress'; readonly requestId: number; readonly fraction: number }
  | {
      readonly type: 'csv-export-progress';
      readonly requestId: number;
      readonly fraction: number;
      readonly rows: number;
    }
  | { readonly type: 'csv-export-chunk'; readonly requestId: number; readonly chunk: ArrayBuffer; readonly rows: number }
  | { readonly type: 'csv-export-complete'; readonly requestId: number; readonly rows: number }
  | { readonly type: 'complete'; readonly requestId: number; readonly dataset: DatasetDescriptor }
  | { readonly type: 'window'; readonly requestId: number; readonly window: ChannelWindow }
  | { readonly type: 'statistics'; readonly requestId: number; readonly statistics: ChannelStatistics }
  | { readonly type: 'difference-series'; readonly requestId: number; readonly result: DifferenceResult }
  | { readonly type: 'difference-statistics'; readonly requestId: number; readonly statistics: DifferenceStatistics }
  | { readonly type: 'comparison-panel'; readonly requestId: number; readonly result: ComparisonPanelQueryResult }
  | { readonly type: 'error'; readonly requestId: number; readonly code: WorkerErrorCode; readonly message: string };
