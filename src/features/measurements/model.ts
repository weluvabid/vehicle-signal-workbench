export type TimestampEncoding = 'iso-8601' | 'unix-seconds' | 'unix-milliseconds';

export interface ChannelDescriptor {
  readonly id: string;
  readonly sourceColumn: string;
  readonly label: string;
  readonly unit: string | null;
  readonly sampleCount: number;
  readonly missingSampleCount: number;
}

export interface DatasetDescriptor {
  readonly id: string;
  readonly name: string;
  readonly sourceFileName: string;
  readonly importedAt: string;
  readonly sampleCount: number;
  readonly durationSeconds: number;
  readonly timeOriginEpochSeconds: number;
  readonly timestampEncoding: TimestampEncoding;
  readonly channels: readonly ChannelDescriptor[];
  /** Canonical worker-owned typed-array storage, excluding transient import buffers. */
  readonly retainedStorageBytes?: number;
  readonly timeAxisBytes?: number;
  readonly channelValueBytes?: number;
  readonly envelopeIndexBytes?: number;
}

export interface MeasurementChannel {
  readonly descriptor: ChannelDescriptor;
  /** Samples are aligned by index with the dataset time axis. Missing values are NaN. */
  readonly values: Float64Array;
}

export interface MeasurementDataset {
  readonly descriptor: DatasetDescriptor;
  /** Seconds elapsed from the first source timestamp. Strictly increasing. */
  readonly timeSeconds: Float64Array;
  readonly channels: ReadonlyMap<string, MeasurementChannel>;
}

export interface CsvImportOptions {
  readonly timestampColumn: string;
  readonly timestampEncoding: TimestampEncoding;
}

export interface ChannelWindow {
  readonly datasetId: string;
  readonly channelId: string;
  readonly startIndex: number;
  readonly timeSeconds: Float64Array;
  readonly values: Float64Array;
}

export interface ChannelStatistics {
  readonly datasetId: string;
  readonly channelId: string;
  readonly startIndex: number;
  readonly endIndex: number;
  readonly sampleCount: number;
  readonly validCount: number;
  readonly missingCount: number;
  readonly min: number | null;
  readonly max: number | null;
  readonly mean: number | null;
  readonly standardDeviation: number | null;
}
