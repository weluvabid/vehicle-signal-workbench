export function parseFiniteChartNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export interface DataZoomRangeEvent {
  readonly start?: number | string;
  readonly end?: number | string;
  readonly startValue?: number | string;
  readonly endValue?: number | string;
  readonly dataZoomId?: string;
  readonly batch?: readonly DataZoomRangeEvent[];
}

export interface TimeViewport {
  readonly startSeconds: number;
  readonly endSeconds: number;
}

/** Purely resolves ECharts value/percentage zoom payloads into bounded seconds. */
export function resolveDataZoomViewport(
  rawEvent: DataZoomRangeEvent,
  domainStart: number,
  domainEnd: number,
): TimeViewport | null {
  if (!Number.isFinite(domainStart) || !Number.isFinite(domainEnd) || domainEnd <= domainStart) return null;
  const events = rawEvent.batch?.length ? [...rawEvent.batch].reverse() : [rawEvent];
  const event = events.find((candidate) => {
    const hasValues = parseFiniteChartNumber(candidate.startValue) !== null && parseFiniteChartNumber(candidate.endValue) !== null;
    const hasPercentages = parseFiniteChartNumber(candidate.start) !== null && parseFiniteChartNumber(candidate.end) !== null;
    return hasValues || hasPercentages;
  });
  if (!event) return null;

  const duration = domainEnd - domainStart;
  const startValue = parseFiniteChartNumber(event.startValue);
  const endValue = parseFiniteChartNumber(event.endValue);
  const startPercent = parseFiniteChartNumber(event.start);
  const endPercent = parseFiniteChartNumber(event.end);
  const start = startValue ?? (startPercent === null ? null : domainStart + duration * startPercent / 100);
  const end = endValue ?? (endPercent === null ? null : domainStart + duration * endPercent / 100);
  if (start === null || end === null || end <= start) return null;
  const boundedStart = Math.max(domainStart, start);
  const boundedEnd = Math.min(domainEnd, end);
  return boundedEnd > boundedStart ? { startSeconds: boundedStart, endSeconds: boundedEnd } : null;
}

/** Backwards-compatible name retained for existing callers and tests. */
export const resolveDataZoomRange = resolveDataZoomViewport;
