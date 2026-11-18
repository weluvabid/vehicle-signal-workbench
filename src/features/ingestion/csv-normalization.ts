import type { TimestampEncoding } from '../measurements/model';
import { MeasurementError } from '../measurements/errors.ts';

export function parseTimestamp(
  raw: string,
  encoding: TimestampEncoding,
  rowNumber: number,
): number {
  const value = raw.trim();

  if (value.length === 0) {
    throw new MeasurementError('INVALID_TIMESTAMP', 'Timestamp is empty.', rowNumber);
  }

  let epochMilliseconds: number;

  if (encoding === 'iso-8601') {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) {
      throw new MeasurementError(
        'INVALID_TIMESTAMP',
        `Timestamp "${value}" is not an ISO 8601 date-time with an explicit timezone.`,
        rowNumber,
      );
    }
    epochMilliseconds = Date.parse(value);
  } else {
    const numeric = Number(value);

    if (!Number.isFinite(numeric)) {
      throw new MeasurementError(
        'INVALID_TIMESTAMP',
        `Timestamp "${value}" is not a finite number.`,
        rowNumber,
      );
    }

    epochMilliseconds = encoding === 'unix-seconds' ? numeric * 1_000 : numeric;
  }

  if (!Number.isFinite(epochMilliseconds)) {
    throw new MeasurementError(
      'INVALID_TIMESTAMP',
      `Timestamp "${value}" is not valid for ${encoding}.`,
      rowNumber,
    );
  }

  return epochMilliseconds / 1_000;
}

export function parseNumericSample(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') {
    return Number.NaN;
  }

  const value = Number(raw);

  return Number.isFinite(value) ? value : Number.NaN;
}

export function parseColumnLabel(sourceColumn: string): { label: string; unit: string | null } {
  const match = /^(.*?)\s*\[([^\]]+)\]\s*$/.exec(sourceColumn);

  if (!match) {
    return { label: sourceColumn.trim(), unit: null };
  }

  return {
    label: match[1].trim(),
    unit: match[2].trim(),
  };
}

export function createChannelId(sourceColumn: string, index: number): string {
  const slug = sourceColumn
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  return `${slug || 'channel'}-${index}`;
}

export function detectTimestampColumn(headers: readonly string[]): string | null {
  const candidates = headers.filter((header) =>
    /^(time|timestamp|time\s*\([^)]*\)|elapsed\s*time|elapsed_time|time_s|time_ms)$/i.test(
      header.trim(),
    ),
  );

  return candidates.length === 1 ? candidates[0] : null;
}
