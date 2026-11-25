const measurementFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 });
const integerFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const scientificFormatter = new Intl.NumberFormat(undefined, {
  notation: 'scientific',
  maximumSignificantDigits: 4,
});

export function formatMeasurementNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return measurementFormatter.format(Object.is(value, -0) ? 0 : value);
}

export function formatChartNumber(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const magnitude = Math.abs(value);
  if (magnitude !== 0 && (magnitude >= 1e9 || magnitude < 1e-4))
    return scientificFormatter.format(value);
  return measurementFormatter.format(Object.is(value, -0) ? 0 : value);
}

export function formatInteger(value: number): string {
  return integerFormatter.format(value);
}
