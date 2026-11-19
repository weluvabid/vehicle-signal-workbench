export interface DataZoomPercentRange {
  readonly start: number;
  readonly end: number;
}

const MIN_SPAN_PERCENT = 0.001;
const ZOOM_SENSITIVITY = 0.002;

/** Zooms around the pointer's horizontal position, keeping that time anchored. */
export function getWheelZoomRange(
  range: DataZoomPercentRange,
  deltaY: number,
  anchor: number,
  minimumSpanPercent = MIN_SPAN_PERCENT,
): DataZoomPercentRange | null {
  if (!Number.isFinite(range.start) || !Number.isFinite(range.end) || range.end <= range.start || !Number.isFinite(deltaY)) return null;
  const span = range.end - range.start;
  const nextSpan = Math.min(100, Math.max(minimumSpanPercent, span * Math.exp(deltaY * ZOOM_SENSITIVITY)));
  if (Math.abs(nextSpan - span) < 1e-9) return null;
  const boundedAnchor = Math.min(1, Math.max(0, anchor));
  const anchorPercent = range.start + span * boundedAnchor;
  const start = Math.min(100 - nextSpan, Math.max(0, anchorPercent - nextSpan * boundedAnchor));
  return { start, end: start + nextSpan };
}
