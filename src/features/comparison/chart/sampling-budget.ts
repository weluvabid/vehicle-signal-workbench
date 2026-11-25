export function resolveSamplingPixelWidth(chartWidth: number): number {
  if (!Number.isFinite(chartWidth) || chartWidth <= 0) return 15;

  if (chartWidth <= 1_440) return 15;

  if (chartWidth <= 1_920) return 16;

  return 18;
}
