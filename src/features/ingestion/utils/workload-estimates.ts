import type { WorkloadPreset } from '@/features/ingestion/synthetic-drive';

const ESTIMATED_CSV_BYTES_PER_ROW = 40;
const ESTIMATED_ARRAY_BYTES_PER_ROW = 48;
const BYTES_PER_MEBIBYTE = 1_048_576;
const RECORDING_COUNT = 2;

export interface WorkloadEstimates {
  readonly totalRows: number;
  readonly csvMiB: number;
  readonly arrayMiB: number;
}

export function calculateWorkloadEstimates(preset: WorkloadPreset): WorkloadEstimates {
  return {
    totalRows: preset.rows * RECORDING_COUNT,
    csvMiB: (preset.rows * ESTIMATED_CSV_BYTES_PER_ROW * RECORDING_COUNT) / BYTES_PER_MEBIBYTE,
    arrayMiB: (preset.rows * ESTIMATED_ARRAY_BYTES_PER_ROW * RECORDING_COUNT) / BYTES_PER_MEBIBYTE,
  };
}
