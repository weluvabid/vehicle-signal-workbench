'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DatasetDescriptor } from '@/features/measurements/model';
import type { SignalSelection } from '@/features/comparison/types';
import type { MeasurementWorkerClient } from '@/features/ingestion/measurement-worker.client';
import type { MetricsQueryResult } from '@/features/ingestion/worker-protocol';
import { buildMetricsPanelQueries } from './metrics-query';
const METRICS_DEBOUNCE_MS = 120;

interface MetricsViewportOptions {
  readonly client: MeasurementWorkerClient;
  readonly reference: DatasetDescriptor;
  readonly comparison: DatasetDescriptor;
  readonly selections: readonly SignalSelection[];
  readonly offsetSeconds: number;
}

/** Debounces the viewport used by Channel analysis and cancels superseded worker queries. */
export function useMetricsViewport(options: MetricsViewportOptions) {
  const [viewport, setViewport] = useState<{
    start: number;
    end: number;
    identity: string;
    isInitial: boolean;
  } | null>(null);
  const [result, setResult] = useState<MetricsQueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panels = useMemo(
    () => buildMetricsPanelQueries(options.selections, options.reference),
    [options.selections, options.reference],
  );
  const identity = `${options.reference.id}:${options.comparison.id}:${options.offsetSeconds}:${panels.map((panel) => `${panel.referenceChannelId}:${panel.comparisonChannelId}`).join('|')}`;
  const currentIdentity = useRef(identity);
  const previousIdentity = useRef(identity);

  useEffect(() => {
    if (previousIdentity.current === identity) return;

    previousIdentity.current = identity;
    currentIdentity.current = identity;
    setResult(null);
    setLoading(false);
    setError(null);
  }, [identity]);

  const setViewportRange = useCallback(
    (start: number, end: number, isInitial = false) => {
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;

      setViewport((current) =>
        current?.start === start &&
        current?.end === end &&
        current.identity === identity &&
        current.isInitial === isInitial
          ? current
          : { start, end, identity, isInitial },
      );
    },
    [identity],
  );

  useEffect(() => {
    if (
      !viewport ||
      viewport.identity !== identity ||
      panels.length === 0 ||
      currentIdentity.current !== identity
    )
      return;

    let current = true;
    let request: ReturnType<MeasurementWorkerClient['queryMetrics']> | null = null;
    const timer = setTimeout(() => {
      if (!current) return;

      setLoading(true);
      setError(null);
      request = options.client.queryMetrics(
        options.reference.id,
        options.comparison.id,
        panels,
        viewport.start,
        viewport.end,
        options.offsetSeconds,
      );
      void request.promise
        .then((next) => {
          if (!current || currentIdentity.current !== identity) return;

          setResult(next);
        })
        .catch((cause: unknown) => {
          if (!current || (cause instanceof DOMException && cause.name === 'AbortError')) return;

          setError(cause instanceof Error ? cause.message : 'Unable to query channel metrics.');
        })
        .finally(() => {
          if (current) setLoading(false);
        });
    }, METRICS_DEBOUNCE_MS);

    return () => {
      current = false;
      clearTimeout(timer);
      request?.cancel();
    };
  }, [
    options.client,
    options.reference.id,
    options.comparison.id,
    panels,
    options.offsetSeconds,
    viewport,
    identity,
  ]);

  return {
    viewport: viewport ? { start: viewport.start, end: viewport.end } : null,
    setViewportRange,
    result,
    loading,
    error,
  };
}
