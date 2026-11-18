import Papa from 'papaparse';
import { detectTimestampColumn } from './csv-normalization';
import type { TimestampEncoding } from '../measurements/model';

export interface CsvPreflight {
  readonly headers: readonly string[];
  readonly timestampColumn: string | null;
  readonly timestampEncoding: TimestampEncoding | null;
  readonly numericChannels: readonly string[];
  readonly inspectedRows: number;
  readonly delimiter: string;
  readonly warnings: readonly string[];
}

/** Inspect a bounded preview only. The complete File is never materialized or imported here. */
export async function inspectCsv(file: File): Promise<CsvPreflight> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      preview: 8,
      skipEmptyLines: 'greedy',
      dynamicTyping: false,
      complete: (result) => {
        const headers = result.meta.fields?.map((field) => field.trim()) ?? [];
        if (result.errors.length > 0) {
          reject(new Error(`CSV preflight failed: ${result.errors[0].message}`));
          return;
        }
        if (headers.length < 2 || result.data.length === 0) {
          reject(new Error('CSV must contain a header and at least one measurement row.'));
          return;
        }
        if (new Set(headers).size !== headers.length) {
          reject(new Error('CSV headers must be unique after trimming whitespace.'));
          return;
        }

        const timestampColumn = detectTimestampColumn(headers);
        const warnings: string[] = [];
        let timestampEncoding: TimestampEncoding | null = null;
        if (timestampColumn) {
          const values = result.data.map((row) => row[timestampColumn]?.trim()).filter(Boolean);
          if (values.length > 0 && values.every((value) => /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(value))) {
            timestampEncoding = 'iso-8601';
          } else if (values.length > 0 && values.every((value) => Number.isFinite(Number(value)))) {
            const numbers = values.map(Number);
            const magnitude = Math.max(...numbers.map((value) => Math.abs(value)));
            if (magnitude >= 1e11) timestampEncoding = 'unix-milliseconds';
            else if (magnitude >= 1e8) timestampEncoding = 'unix-seconds';
            else warnings.push('Numeric timestamp units are ambiguous. Confirm seconds or milliseconds.');
          } else {
            warnings.push('Timestamp format could not be inferred confidently.');
          }
        } else {
          warnings.push('Timestamp column could not be identified automatically.');
        }

        const numericChannels = headers.filter((header) => header !== timestampColumn && result.data.some((row) => {
          const value = row[header]?.trim();
          return value !== undefined && value !== '' && Number.isFinite(Number(value));
        }));
        if (numericChannels.length === 0) warnings.push('No numeric measurement channels were detected in the preview.');
        if (result.data.length === 8) warnings.push('Type detection is based on the first eight non-empty rows.');

        resolve({
          headers,
          timestampColumn,
          timestampEncoding,
          numericChannels,
          inspectedRows: result.data.length,
          delimiter: result.meta.delimiter,
          warnings,
        });
      },
      error: reject,
    });
  });
}

/** Backwards-compatible header-only API for existing callers/tests. */
export async function inspectCsvHeaders(file: File): Promise<string[]> {
  return (await inspectCsv(file)).headers.slice();
}
