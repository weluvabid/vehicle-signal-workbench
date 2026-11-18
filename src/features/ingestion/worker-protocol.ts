import type { DifferenceResult, DifferenceStatistics } from '../measurements/difference';
import type {
  ChannelStatistics,
  ChannelWindow,
  CsvImportOptions,
  DatasetDescriptor,
} from '../measurements/model';

export type IngestionRequest =
  | { readonly type: 'import'; readonly requestId: number; readonly file: File; readonly options: CsvImportOptions }
  | { readonly type: 'cancel'; readonly requestId: number }
  | { readonly type: 'release'; readonly datasetId: string }
  | { readonly type: 'query-window'; readonly requestId: number; readonly datasetId: string; readonly channelId: string; readonly startIndex: number; readonly endIndex: number }
  | { readonly type: 'query-time-window'; readonly requestId: number; readonly datasetId: string; readonly channelId: string; readonly startSeconds: number; readonly endSeconds: number }
  | { readonly type: 'query-envelope-time-window'; readonly requestId: number; readonly datasetId: string; readonly channelId: string; readonly startSeconds: number; readonly endSeconds: number; readonly pixelWidth: number }
  | { readonly type: 'query-statistics'; readonly requestId: number; readonly datasetId: string; readonly channelId: string; readonly startIndex: number; readonly endIndex: number }
  | { readonly type: 'query-time-statistics'; readonly requestId: number; readonly datasetId: string; readonly channelId: string; readonly startSeconds: number; readonly endSeconds: number }
  | { readonly type: 'query-difference-series'; readonly requestId: number; readonly referenceDatasetId: string; readonly referenceChannelId: string; readonly comparisonDatasetId: string; readonly comparisonChannelId: string; readonly startSeconds: number; readonly endSeconds: number; readonly comparisonOffsetSeconds: number; readonly pixelWidth: number }
  | { readonly type: 'query-difference-statistics'; readonly requestId: number; readonly referenceDatasetId: string; readonly referenceChannelId: string; readonly comparisonDatasetId: string; readonly comparisonChannelId: string; readonly startSeconds: number; readonly endSeconds: number; readonly comparisonOffsetSeconds: number };

export type IngestionResponse =
  | { readonly type: 'progress'; readonly requestId: number; readonly fraction: number }
  | { readonly type: 'complete'; readonly requestId: number; readonly dataset: DatasetDescriptor }
  | { readonly type: 'window'; readonly requestId: number; readonly window: ChannelWindow }
  | { readonly type: 'statistics'; readonly requestId: number; readonly statistics: ChannelStatistics }
  | { readonly type: 'difference-series'; readonly requestId: number; readonly result: DifferenceResult }
  | { readonly type: 'difference-statistics'; readonly requestId: number; readonly statistics: DifferenceStatistics }
  | { readonly type: 'error'; readonly requestId: number; readonly code: string; readonly message: string };
