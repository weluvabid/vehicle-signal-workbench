'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DatasetDescriptor, ChannelStatistics } from '@/features/measurements/model';
import type { DifferencePlotResult, DifferenceStatistics } from '@/features/measurements/difference';
import type { ComparisonPlotData } from '@/features/measurements/plot-data';
import { buildComparisonPlotData } from '@/features/measurements/plot-data';
import type { MeasurementWorkerClient } from '@/features/ingestion/measurement-worker.client';
import type { SignalSelection } from './types';

export interface SignalPanelResult {
  readonly id: string;
  readonly label: string;
  readonly unit: string | null;
  readonly data: ComparisonPlotData;
  readonly referenceStatistics: ChannelStatistics;
  readonly comparisonStatistics: ChannelStatistics;
  readonly differenceStatistics: DifferenceStatistics;
  readonly differenceSeries: DifferencePlotResult;
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

export function useSignalViewport(options: SignalViewportOptions) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<readonly SignalPanelResult[]>([]);
  const [resultsRange, setResultsRange] = useState<{ readonly start: number; readonly end: number } | null>(null);
  const [initialPreparationMs, setInitialPreparationMs] = useState<number | null>(null);
  const [interactionQueryMs, setInteractionQueryMs] = useState<number | null>(null);
  const [interactionLoading, setInteractionLoading] = useState(false);
  const hasStartedInitialQuery = useRef(false);
  const generation = useRef(0);
  const lastRequestKey = useRef('');
  const selectionKey = useMemo(
    () => options.selections.map((selection) => `${selection.referenceChannelId}:${selection.comparisonChannelId}`).join('|'),
    [options.selections],
  );

  const requestViewport = useCallback((startSeconds: number, endSeconds: number, pixelWidth: number) => {
    const start = Math.max(options.startSeconds, startSeconds);
    const end = Math.min(options.endSeconds, endSeconds);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || options.selections.length === 0) return;

    const width = Math.max(1, Math.min(8_192, Math.floor(pixelWidth)));
    const requestKey = [start.toPrecision(13), end.toPrecision(13), width, selectionKey].join(':');
    if (requestKey === lastRequestKey.current) return;
    lastRequestKey.current = requestKey;

    const current = ++generation.current;
    const queryStartedAt = performance.now();
    const isInitialPreparation = !hasStartedInitialQuery.current;
    hasStartedInitialQuery.current = true;
    setLoading(true);
    if (!isInitialPreparation) setInteractionLoading(true);
    setError(null);
    setResults([]);
    setResultsRange(null);

    const requests = options.selections.map(async (selection): Promise<SignalPanelResult> => {
      const referenceChannel = options.reference.channels.find((channel) => channel.id === selection.referenceChannelId);
      if (!referenceChannel) throw new Error(`Reference channel ${selection.referenceChannelId} is unavailable.`);
      const comparisonChannel = options.comparison.channels.find((channel) => channel.id === selection.comparisonChannelId);
      if (!comparisonChannel) throw new Error(`Comparison channel ${selection.comparisonChannelId} is unavailable.`);

      const panel = await options.client.queryComparisonPanel(
        options.reference.id, selection.referenceChannelId,
        options.comparison.id, selection.comparisonChannelId,
        start, end, options.offsetSeconds, width,
      );
      const { referenceWindow, comparisonWindow, referenceStatistics, comparisonStatistics, differenceSeries } = panel;
      return {
        id: selection.referenceChannelId,
        label: referenceChannel.label,
        unit: referenceChannel.unit,
        data: buildComparisonPlotData(referenceWindow, comparisonWindow, options.offsetSeconds),
        referenceStatistics,
        comparisonStatistics,
        differenceStatistics: differenceSeries.statistics,
        differenceSeries,
      };
    });

    Promise.all(requests).then((nextResults) => {
      if (generation.current !== current) return;
      setResults(nextResults);
      setResultsRange({ start, end });
      const elapsedMs = performance.now() - queryStartedAt;
      if (isInitialPreparation) setInitialPreparationMs(elapsedMs);
      else setInteractionQueryMs(elapsedMs);
    }).catch((cause: unknown) => {
      if (generation.current !== current) return;
      setError(cause instanceof Error ? cause.message : 'Unable to query signal data.');
    }).finally(() => {
      if (generation.current === current) {
        setLoading(false);
        if (!isInitialPreparation) setInteractionLoading(false);
      }
    });
  }, [options.client, options.reference, options.comparison, options.selections,
    options.offsetSeconds, options.startSeconds, options.endSeconds, selectionKey]);

  useEffect(() => {
    lastRequestKey.current = '';
    hasStartedInitialQuery.current = false;
    setInitialPreparationMs(null);
    setInteractionQueryMs(null);
    setInteractionLoading(false);
    return () => { generation.current += 1; };
  }, [options.reference.id, options.comparison.id, selectionKey,
    options.offsetSeconds, options.startSeconds, options.endSeconds]);

  useEffect(() => {
    requestViewport(options.startSeconds, options.endSeconds, 1_024);
  }, [requestViewport, options.startSeconds, options.endSeconds]);

  return { loading, error, results, resultsRange, requestViewport, selectionKey, initialPreparationMs, interactionQueryMs, interactionLoading };
}
