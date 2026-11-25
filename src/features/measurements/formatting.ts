import type { ChannelStatistics } from './model';
import { formatInteger, formatMeasurementNumber } from './number-format';

export function formatMeasurementValue(value: number | null): string {
  return formatMeasurementNumber(value);
}

export function formatChannelStatistics(statistics: ChannelStatistics) {
  return {
    samples: formatInteger(statistics.sampleCount),
    valid: formatInteger(statistics.validCount),
    missing: formatInteger(statistics.missingCount),
    min: formatMeasurementValue(statistics.min),
    max: formatMeasurementValue(statistics.max),
    mean: formatMeasurementValue(statistics.mean),
    standardDeviation: formatMeasurementValue(statistics.standardDeviation),
  };
}
