'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DatasetDescriptor } from '@/features/measurements/model';
import type { SignalSelection } from '@/features/comparison/types';
import type { MeasurementWorkerClient } from '@/features/ingestion/measurement-worker.client';
import type { MetricsQueryResult } from '@/features/ingestion/worker-protocol';
import { buildMetricsPanelQueries } from './metrics-query';

interface MetricsViewportOptions {
  readonly client: MeasurementWorkerClient;
  readonly reference: DatasetDescriptor;
  readonly comparison: DatasetDescriptor;
  readonly selections: readonly SignalSelection[];
  readonly offsetSeconds: number;
}

/** Reuses the former table-slider lifecycle, but requests indexed metrics instead of raw rows. */
export function useMetricsViewport(options: MetricsViewportOptions) {
  const [viewport, setViewport] = useState<{ start: number; end: number } | null>(null);
  const [result, setResult] = useState<MetricsQueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panels = useMemo(
    () => buildMetricsPanelQueries(options.selections, options.reference),
    [options.selections, options.reference],
  );

  const setViewportRange = useCallback((start: number, end: number) => {
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
    setViewport((current) => current?.start === start && current?.end === end ? current : { start, end });
  }, []);

  useEffect(() => {
    if (!viewport || panels.length === 0) return;
    let current = true;
    setLoading(true);
    setError(null);
    const request = options.client.queryMetrics(
      options.reference.id, options.comparison.id, panels,
      viewport.start, viewport.end, options.offsetSeconds,
    );
    void request.promise
      .then((next) => { if (current) setResult(next); })
      .catch((cause: unknown) => {
        if (!current || (cause instanceof DOMException && cause.name === 'AbortError')) return;
        setError(cause instanceof Error ? cause.message : 'Unable to query channel metrics.');
      })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; request.cancel(); };
  }, [options.client, options.reference.id, options.comparison.id, panels, options.offsetSeconds, viewport]);

  useEffect(() => {
    setResult(null);
    setViewport(null);
  }, [options.reference.id, options.comparison.id, options.offsetSeconds, panels]);

  return { viewport, setViewportRange, result, loading, error };
}
