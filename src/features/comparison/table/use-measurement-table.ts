'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DatasetDescriptor } from '@/features/measurements/model';
import type { SignalSelection } from '@/features/comparison/types';
import type { MeasurementWorkerClient } from '@/features/ingestion/measurement-worker.client';
import type { TableQueryResult, TableQueryRow } from '@/features/ingestion/worker-protocol';
import { buildTablePanelQueries, TABLE_PAGE_SIZE } from './table-query';

interface MeasurementTableOptions {
  readonly client: MeasurementWorkerClient;
  readonly reference: DatasetDescriptor;
  readonly comparison: DatasetDescriptor;
  readonly selections: readonly SignalSelection[];
  readonly offsetSeconds: number;
}

/** Owns table viewport, pagination, worker requests and table-only result state. */
export function useMeasurementTable(options: MeasurementTableOptions) {
  const [page, setPage] = useState(0);
  const [viewport, setViewport] = useState<{ start: number; end: number } | null>(null);
  const [result, setResult] = useState<TableQueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setViewportRange = useCallback((start: number, end: number) => {
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
    setPage(0);
    setResult(null);
    setViewport((current) => current?.start === start && current?.end === end ? current : { start, end });
  }, []);

  const panels = useMemo(
    () => buildTablePanelQueries(options.selections, options.reference),
    [options.selections, options.reference],
  );

  useEffect(() => {
    if (!viewport || panels.length === 0) return;
    let current = true;
    setLoading(true);
    setError(null);
    const request = options.client.queryTable(
      options.reference.id,
      options.comparison.id,
      panels,
      viewport.start,
      viewport.end,
      options.offsetSeconds,
      page,
      TABLE_PAGE_SIZE,
    );

    void request.promise
      .then((next) => { if (current) setResult(next); })
      .catch((cause: unknown) => {
        if (!current || (cause instanceof DOMException && cause.name === 'AbortError')) return;
        setError(cause instanceof Error ? cause.message : 'Unable to query measurement table.');
      })
      .finally(() => { if (current) setLoading(false); });

    return () => { current = false; request.cancel(); };
  }, [options.client, options.reference.id, options.comparison.id, panels, options.offsetSeconds, viewport, page]);

  useEffect(() => { setPage(0); }, [options.reference.id, options.comparison.id]);

  const pageCount = Math.max(1, Math.ceil((result?.totalRows ?? 0) / TABLE_PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const rows: readonly TableQueryRow[] = result?.rows ?? [];

  const previousPage = useCallback(() => setPage((value) => Math.max(0, value - 1)), []);
  const nextPage = useCallback(() => setPage((value) => Math.min(pageCount - 1, value + 1)), [pageCount]);

  return {
    viewport,
    setViewportRange,
    result,
    rows,
    loading,
    error,
    page: safePage,
    pageCount,
    previousPage,
    nextPage,
  };
}
