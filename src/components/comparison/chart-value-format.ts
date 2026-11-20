const numberFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 });
const scientificFormatter = new Intl.NumberFormat(undefined, {
  notation: 'scientific',
  maximumSignificantDigits: 4,
});

export function formatChartValue(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const magnitude = Math.abs(value);
  if (magnitude !== 0 && (magnitude >= 1e9 || magnitude < 1e-4))
    return scientificFormatter.format(value);
  return numberFormatter.format(Object.is(value, -0) ? 0 : value);
}
