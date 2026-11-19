import type { ChannelStatistics } from './model';

const numberFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 });
const integerFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

export function formatMeasurementValue(value: number | null): string {
  if (value === null) return '—';
  return numberFormatter.format(Object.is(value, -0) ? 0 : value);
}

export function formatChannelStatistics(statistics: ChannelStatistics) {
  return {
    samples: integerFormatter.format(statistics.sampleCount),
    valid: integerFormatter.format(statistics.validCount),
    missing: integerFormatter.format(statistics.missingCount),
    min: formatMeasurementValue(statistics.min),
    max: formatMeasurementValue(statistics.max),
    mean: formatMeasurementValue(statistics.mean),
    standardDeviation: formatMeasurementValue(statistics.standardDeviation),
  };
}

export function formatMeasurementCount(value: number): string {
  return integerFormatter.format(value);
}
