export interface TimelineOverlap {
  /** Start of the shared interval on the reference run's elapsed-time axis. */
  readonly startSeconds: number;
  /** End (exclusive) of the shared interval on the reference run's elapsed-time axis. */
  readonly endSeconds: number;
  readonly durationSeconds: number;
}

/**
 * Offset is added to comparison elapsed time to express it on the reference axis.
 * Positive values move comparison samples later; negative values move them earlier.
 */
export function calculateTimelineOverlap(
  referenceDurationSeconds: number,
  comparisonDurationSeconds: number,
  comparisonOffsetSeconds: number,
): TimelineOverlap {
  if (
    !Number.isFinite(referenceDurationSeconds) ||
    referenceDurationSeconds < 0 ||
    !Number.isFinite(comparisonDurationSeconds) ||
    comparisonDurationSeconds < 0 ||
    !Number.isFinite(comparisonOffsetSeconds)
  ) {
    throw new RangeError(
      'Timeline durations and offset must be finite; durations cannot be negative.',
    );
  }

  const startSeconds = Math.max(0, comparisonOffsetSeconds);
  const endSeconds = Math.min(
    referenceDurationSeconds,
    comparisonOffsetSeconds + comparisonDurationSeconds,
  );
  const durationSeconds = Math.max(0, endSeconds - startSeconds);
  const emptyIntervalPoint = Math.min(
    referenceDurationSeconds,
    Math.max(0, comparisonOffsetSeconds),
  );

  return durationSeconds === 0
    ? {
        startSeconds: emptyIntervalPoint,
        endSeconds: emptyIntervalPoint,
        durationSeconds: 0,
      }
    : { startSeconds, endSeconds, durationSeconds };
}
