/** Initial visible timeline fraction. Large runs start focused on the tail. */
export const EAGER_INDEX_SAMPLE_THRESHOLD = 250_000;
const REFERENCE_SAMPLE_COUNT = 10_000_000;
const REFERENCE_VISIBLE_FRACTION = 0.05;
const MAX_INITIAL_VISIBLE_FRACTION = 0.25;

export function getInitialVisibleFraction(sampleCount: number): number {
  if (!Number.isFinite(sampleCount) || sampleCount <= EAGER_INDEX_SAMPLE_THRESHOLD) return 1;

  const fraction = REFERENCE_VISIBLE_FRACTION * (REFERENCE_SAMPLE_COUNT / sampleCount) ** 0.301;
  return Math.min(MAX_INITIAL_VISIBLE_FRACTION, Math.max(REFERENCE_VISIBLE_FRACTION, fraction));
}

export function getInitialViewport(startSeconds: number, endSeconds: number, fraction: number) {
  const start = startSeconds + (endSeconds - startSeconds) * (1 - fraction);
  return { startSeconds: start, endSeconds };
}
