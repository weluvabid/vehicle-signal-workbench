import { formatDifferenceCsvRow } from './csv-format';
import type { DifferenceResult } from './difference';

export const CSV_EXPORT_MAX_ROWS = 5_000_000;
export const CSV_EXPORT_MAX_ROWS_PER_CHANNEL = 2_000_000;
export const CSV_EXPORT_CHUNK_ROWS = 16_384;

const csvEncoder = new TextEncoder();

export const DIFFERENCE_CSV_HEADER =
  'channel,unit,reference_time_seconds,reference_value,comparison_interpolated_value,delta_reference_minus_comparison,matched';

/** Encode one bounded CSV chunk. The worker transfers the returned buffer. */
export function encodeDifferenceCsvChunk(
  label: string,
  unit: string,
  result: DifferenceResult,
  includeHeader: boolean,
): Uint8Array {
  const rows = new Array<string>(result.timeSeconds.length + (includeHeader ? 1 : 0));
  let rowIndex = 0;
  if (includeHeader) rows[rowIndex++] = DIFFERENCE_CSV_HEADER;

  for (let index = 0; index < result.timeSeconds.length; index++) {
    rows[rowIndex++] = formatDifferenceCsvRow(
      label,
      unit,
      result.timeSeconds[index],
      result.referenceValues[index],
      result.comparisonValues[index],
      result.delta[index],
    );
  }

  return csvEncoder.encode(`${rows.join('\r\n')}\r\n`);
}
