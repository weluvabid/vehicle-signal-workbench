/** CSV cell escaping shared by all measurement exports. */
export function escapeCsvCell(value: string | number | boolean): string {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export function formatDifferenceCsvRow(
  channelLabel: string,
  unit: string,
  timeSeconds: number,
  referenceValue: number,
  comparisonValue: number,
  delta: number,
): string {
  return `${escapeCsvCell(channelLabel)},${escapeCsvCell(unit)},${escapeCsvCell(timeSeconds)},${escapeCsvCell(Number.isFinite(referenceValue) ? referenceValue : '')},${escapeCsvCell(Number.isFinite(comparisonValue) ? comparisonValue : '')},${escapeCsvCell(Number.isFinite(delta) ? delta : '')},${escapeCsvCell(Number.isFinite(delta))}`;
}
