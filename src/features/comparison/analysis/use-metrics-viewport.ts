'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DatasetDescriptor } from '@/features/measurements/model';
import type { SignalSelection } from '@/features/comparison/types';
import type { MeasurementWorkerClient } from '@/features/ingestion/measurement-worker.client';
import type { MetricsQueryResult } from '@/features/ingestion/worker-protocol';
import { buildMetricsPanelQueries } from './metrics-query';

const METRICS_DEBOUNCE_MS = 120;
const MAX_WORKER_SAMPLES = 30;

export interface WorkerComputeStatistics {
  readonly medianMs: number;
  readonly p95Ms: number;
  readonly count: number;
}

interface MetricsViewportOptions {
  readonly client: MeasurementWorkerClient;
  readonly reference: DatasetDescriptor;
  readonly comparison: DatasetDescriptor;
  readonly selections: readonly SignalSelection[];
  readonly offsetSeconds: number;
}

function summarizeWorkerSamples(samples: readonly number[]): WorkerComputeStatistics | null {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((left, right) => left - right);
  const percentile = (p: number) => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
  return { medianMs: percentile(0.5), p95Ms: percentile(0.95), count: samples.length };
}

/** Debounces the same range used by Channel analysis and consumes timings returned by that worker query. */
export function useMetricsViewport(options: MetricsViewportOptions) {
  const [viewport, setViewport] = useState<{ start: number; end: number; identity: string; isInitial: boolean } | null>(null);
  const [result, setResult] = useState<MetricsQueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workerCompute, setWorkerCompute] = useState<WorkerComputeStatistics | null>(null);
  const panels = useMemo(
    () => buildMetricsPanelQueries(options.selections, options.reference),
    [options.selections, options.reference],
  );
  const samples = useRef<number[]>([]);
  const identity = `${options.reference.id}:${options.comparison.id}:${options.offsetSeconds}:${panels.map((panel) => `${panel.referenceChannelId}:${panel.comparisonChannelId}`).join('|')}`;
  const currentIdentity = useRef(identity);
  const previousIdentity = useRef(identity);

  useEffect(() => {
    if (previousIdentity.current === identity) return;
    previousIdentity.current = identity;
    currentIdentity.current = identity;
    samples.current = [];
    setResult(null);
    setWorkerCompute(null);
    setLoading(false);
    setError(null);
  }, [identity]);

  const setViewportRange = useCallback((start: number, end: number, isInitial = false) => {
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
    setViewport((current) => current?.start === start && current?.end === end && current.identity === identity && current.isInitial === isInitial
      ? current : { start, end, identity, isInitial });
  }, [identity]);

  useEffect(() => {
    if (!viewport || viewport.identity !== identity || panels.length === 0 || currentIdentity.current !== identity) return;
    let current = true;
    let request: ReturnType<MeasurementWorkerClient['queryMetrics']> | null = null;
    const timer = setTimeout(() => {
      if (!current) return;
      setLoading(true);
      setError(null);
      request = options.client.queryMetrics(
        options.reference.id, options.comparison.id, panels,
        viewport.start, viewport.end, options.offsetSeconds,
      );
      void request.promise
        .then((next) => {
          if (!current || currentIdentity.current !== identity) return;
          setResult(next);
          // Initial viewport is the cold baseline. Only settled user zoom ranges
          // contribute, even if the initial query was superseded before completion.
          if (viewport.isInitial) return;
          const workerComputeMs = next.timings?.workerComputeMs;
          if (!Number.isFinite(workerComputeMs) || workerComputeMs === undefined || workerComputeMs < 0) return;
          const nextSamples = samples.current;
          nextSamples.push(workerComputeMs);
          if (nextSamples.length > MAX_WORKER_SAMPLES) nextSamples.shift();
          setWorkerCompute(summarizeWorkerSamples(nextSamples));
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
  }, [options.client, options.reference.id, options.comparison.id, panels, options.offsetSeconds, viewport, identity]);

  return {
    viewport: viewport ? { start: viewport.start, end: viewport.end } : null,
    setViewportRange, result, loading, error, workerCompute,
  };
}
