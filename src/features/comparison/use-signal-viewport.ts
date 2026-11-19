'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DatasetDescriptor } from '@/features/measurements/model';
import type { ComparisonPlotData } from '@/features/measurements/plot-data';
import { buildComparisonPlotData } from '@/features/measurements/plot-data';
import type { MeasurementWorkerClient, ComparisonQueryHandle } from '@/features/ingestion/measurement-worker.client';
import type { SignalSelection } from './types';

export interface SignalPanelResult {
  readonly id: string;
  readonly label: string;
  readonly unit: string | null;
  readonly data: ComparisonPlotData;
}

interface SignalViewportOptions {
  readonly client: MeasurementWorkerClient;
  readonly reference: DatasetDescriptor;
  readonly comparison: DatasetDescriptor;
  readonly selections: readonly SignalSelection[];
  readonly offsetSeconds: number;
  readonly startSeconds: number;
  readonly endSeconds: number;
}

interface PendingViewport {
  readonly start: number;
  readonly end: number;
  readonly width: number;
  readonly key: string;
}

const VIEWPORT_DEBOUNCE_MS = 120;

export function useSignalViewport(options: SignalViewportOptions) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<readonly SignalPanelResult[]>([]);
  const [resultsRange, setResultsRange] = useState<{ readonly start: number; readonly end: number } | null>(null);
  const [initialPreparation, setInitialPreparation] = useState<{
    readonly indexBuildMs: number | null;
    readonly workerComputeMs: number | null;
    readonly workerRoundTripMs: number;
    readonly plotSeriesMs: number;
    readonly postImportViewportPrepMs: number;
  } | null>(null);
  const [interactionQueryMs, setInteractionQueryMs] = useState<number | null>(null);
  const [interactionLoading, setInteractionLoading] = useState(false);
  const [interactionStats, setInteractionStats] = useState<{ medianMs: number; p95Ms: number; count: number } | null>(null);
  const interactionSamples = useRef<number[]>([]);
  const hasStartedInitialQuery = useRef(false);
  const generation = useRef(0);
  const lastRequestKey = useRef('');
  const pendingViewport = useRef<PendingViewport | null>(null);
  const activeQuery = useRef<ComparisonQueryHandle | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceElapsed = useRef(false);
  const mounted = useRef(true);
  const startPendingQueryRef = useRef<() => void>(() => {});
  const selectionKey = useMemo(
    () => options.selections.map((selection) => `${selection.referenceChannelId}:${selection.comparisonChannelId}`).join('|'),
    [options.selections],
  );

  const startPendingQuery = useCallback(() => {
    if (!mounted.current || !debounceElapsed.current || activeQuery.current || !pendingViewport.current) return;
    const viewport = pendingViewport.current;
    pendingViewport.current = null;
    debounceElapsed.current = false;

    const currentGeneration = ++generation.current;
    const queryStartedAt = performance.now();
    const isInitialPreparation = !hasStartedInitialQuery.current;
    setLoading(true);
    if (!isInitialPreparation) setInteractionLoading(true);
    setError(null);

    const handle = options.client.queryComparisonBatch(
      options.reference.id,
      options.comparison.id,
      options.selections.map((selection) => ({
        referenceChannelId: selection.referenceChannelId,
        comparisonChannelId: selection.comparisonChannelId,
      })),
      viewport.start,
      viewport.end,
      options.offsetSeconds,
      viewport.width,
    );
    activeQuery.current = handle;

    void handle.promise.then((batch) => {
      if (!mounted.current || generation.current !== currentGeneration || activeQuery.current !== handle) return;
      const plotStartedAt = performance.now();
      const nextResults = batch.panels.map((panel, index): SignalPanelResult => {
        const selection = options.selections[index];
        const referenceChannel = options.reference.channels.find((channel) => channel.id === selection.referenceChannelId);
        if (!referenceChannel) throw new Error(`Reference channel ${selection.referenceChannelId} is unavailable.`);
        return {
          id: selection.referenceChannelId,
          label: referenceChannel.label,
          unit: referenceChannel.unit,
          data: buildComparisonPlotData(panel.referenceWindow, panel.comparisonWindow, options.offsetSeconds),
        };
      });
      if (generation.current !== currentGeneration) return;
      const plotSeriesMs = performance.now() - plotStartedAt;
      const elapsedMs = performance.now() - queryStartedAt;
      setResults(nextResults);
      hasStartedInitialQuery.current = true;
      setResultsRange({ start: viewport.start, end: viewport.end });
      if (isInitialPreparation) {
        setInitialPreparation({
          indexBuildMs: batch.timings?.indexBuildMs ?? null,
          workerComputeMs: batch.timings?.workerComputeMs ?? null,
          workerRoundTripMs: Math.max(0, elapsedMs - plotSeriesMs),
          plotSeriesMs,
          postImportViewportPrepMs: elapsedMs,
        });
      }
      else {
        setInteractionQueryMs(elapsedMs);
        const samples = interactionSamples.current;
        samples.push(elapsedMs);
        if (samples.length > 100) samples.shift();
        const sorted = [...samples].sort((a, b) => a - b);
        const percentile = (p: number) => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
        setInteractionStats({ medianMs: percentile(0.5), p95Ms: percentile(0.95), count: samples.length });
      }
    }).catch((cause: unknown) => {
      if (!mounted.current || generation.current !== currentGeneration) return;
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setError(cause instanceof Error ? cause.message : 'Unable to query signal data.');
    }).finally(() => {
      if (activeQuery.current === handle) activeQuery.current = null;
      if (mounted.current && generation.current === currentGeneration) {
        setLoading(false);
        if (!isInitialPreparation) setInteractionLoading(false);
      }
      startPendingQueryRef.current();
    });
  }, [options.client, options.reference, options.comparison, options.selections, options.offsetSeconds]);

  startPendingQueryRef.current = startPendingQuery;

  const requestViewport = useCallback((startSeconds: number, endSeconds: number, pixelWidth: number) => {
    const start = Math.max(options.startSeconds, startSeconds);
    const end = Math.min(options.endSeconds, endSeconds);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || options.selections.length === 0) return;
    const width = Math.max(1, Math.min(8_192, Math.floor(pixelWidth)));
    const key = [start.toPrecision(13), end.toPrecision(13), width, selectionKey].join(':');
    if (key === lastRequestKey.current) return;
    lastRequestKey.current = key;
    generation.current += 1; // invalidate any result already in flight immediately
    pendingViewport.current = { start, end, width, key };
    debounceElapsed.current = false;

    // A new viewport makes the active result stale immediately. The worker
    // acknowledges cancellation at cooperative yield points in its batch.
    activeQuery.current?.cancel();
    if (debounceTimer.current !== null) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      debounceTimer.current = null;
      debounceElapsed.current = true;
      startPendingQuery();
    }, VIEWPORT_DEBOUNCE_MS);
  }, [options.startSeconds, options.endSeconds, options.selections.length, selectionKey, startPendingQuery]);

  useEffect(() => {
    mounted.current = true;
    lastRequestKey.current = '';
    hasStartedInitialQuery.current = false;
    pendingViewport.current = null;
    debounceElapsed.current = false;
    setInitialPreparation(null);
    setInteractionQueryMs(null);
    interactionSamples.current = [];
    setInteractionStats(null);
    setInteractionLoading(false);
    activeQuery.current?.cancel();
    if (debounceTimer.current !== null) clearTimeout(debounceTimer.current);
    return () => {
      mounted.current = false;
      generation.current += 1;
      pendingViewport.current = null;
      if (debounceTimer.current !== null) clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
      activeQuery.current?.cancel();
      activeQuery.current = null;
    };
  }, [options.reference.id, options.comparison.id, selectionKey,
    options.offsetSeconds, options.startSeconds, options.endSeconds]);

  useEffect(() => {
    requestViewport(options.startSeconds, options.endSeconds, 1_024);
  }, [requestViewport, options.startSeconds, options.endSeconds]);

  return { loading, error, results, resultsRange, requestViewport, selectionKey, initialPreparation, interactionQueryMs, interactionLoading, interactionStats };
}
