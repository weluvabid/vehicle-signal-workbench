export interface ChartViewport {
  readonly min: number;
  readonly max: number;
}

const MIN_SPAN_SECONDS = 0.001;

export function clampChartRange(
  start: number,
  end: number,
  domainStart: number,
  domainEnd: number,
): ChartViewport {
  const domainSpan = domainEnd - domainStart;
  const span = Math.min(domainSpan, Math.max(MIN_SPAN_SECONDS, end - start));
  const boundedStart = Math.max(domainStart, Math.min(domainEnd - span, start));
  return { min: boundedStart, max: boundedStart + span };
}
