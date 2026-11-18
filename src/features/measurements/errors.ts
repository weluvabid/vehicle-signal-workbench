export type MeasurementErrorCode =
  | 'EMPTY_FILE'
  | 'INVALID_CSV'
  | 'MISSING_TIMESTAMP_COLUMN'
  | 'INVALID_TIMESTAMP'
  | 'NON_MONOTONIC_TIMESTAMP'
  | 'NO_NUMERIC_CHANNELS'
  | 'NO_VALID_SAMPLES'
  | 'IMPORT_CANCELLED';

export class MeasurementError extends Error {
  readonly code: MeasurementErrorCode;
  readonly rowNumber: number | undefined;

  constructor(code: MeasurementErrorCode, message: string, rowNumber?: number) {
    super(message);
    this.name = 'MeasurementError';
    this.code = code;
    this.rowNumber = rowNumber;
  }
}
