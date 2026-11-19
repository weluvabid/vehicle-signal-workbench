'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { DatasetDescriptor } from '@/features/measurements/model';
import type { ComparisonPlotData, SignalPoint } from '@/features/measurements/plot-data';
import { formatMeasurementValue } from '@/features/measurements/formatting';
import { formatIngestionRates, summarizeIngestion } from '@/features/comparison/performance-metrics';
import { buildSignalPoints } from '@/features/measurements/plot-data';
import type { MeasurementWorkerClient } from '@/features/ingestion/measurement-worker.client';
import type { TableQueryResult, TableQueryRow } from '@/features/ingestion/worker-protocol';
import type { SignalSelection } from '@/features/comparison/types';
import { useSignalViewport } from '@/features/comparison/use-signal-viewport';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const EChartsSignalChart = dynamic(
  () => import('./echarts-signal-chart').then((module) => module.EChartsSignalChart),
  { ssr: false, loading: () => <p className="py-12 text-center text-sm text-muted-foreground">Initializing interactive charts…</p> },
);

interface SignalComparisonPlotProps {
  readonly client: MeasurementWorkerClient;
  readonly reference: DatasetDescriptor;
  readonly comparison: DatasetDescriptor;
  readonly selections: readonly SignalSelection[];
  readonly offsetSeconds: number;
  readonly startSeconds: number;
  readonly endSeconds: number;
  readonly ingestionMetrics: { readonly durationMs: number; readonly totalBytes: number } | null;
}

const EMPTY_DATA: ComparisonPlotData = { reference: [], comparison: [] };
const SERIES_COLORS = ['#a1a1aa', '#60a5fa', '#d6a85f', '#34d399', '#c084fc', '#f472b6'];
const TIME_FORMATTER = new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 });
const PAGE_SIZE = 100;

export function SignalComparisonPlot(props: SignalComparisonPlotProps) {
  const { loading, error, results, requestViewport, selectionKey, initialPreparationMs } = useSignalViewport(props);
  const ingestionSummary = props.ingestionMetrics ? summarizeIngestion(props.reference, props.comparison, props.ingestionMetrics) : null;
  const [page, setPage] = useState(0);
  const [tableRange, setTableRange] = useState<{ start: number; end: number } | null>(null);
  const [tableResult, setTableResult] = useState<TableQueryResult | null>(null);
  const [tableLoading, setTableLoading] = useState(false);
  const [tableError, setTableError] = useState<string | null>(null);
  const onTableViewportChange = useCallback((start: number, end: number) => {
    setPage(0);
    setTableResult(null);
    setTableRange((current) => current?.start === start && current?.end === end ? current : { start, end });
  }, []);
  const [interactionFps, setInteractionFps] = useState<number | null>(null);
  const resultById = useMemo(() => new Map(results.map((result) => [result.id, result])), [results]);
  const panels = useMemo(() => props.selections.map((selection, index) => {
    const channel = props.reference.channels.find((item) => item.id === selection.referenceChannelId);
    const result = resultById.get(selection.referenceChannelId);
    return {
      id: selection.referenceChannelId,
      label: channel?.label ?? selection.referenceChannelId,
      unit: channel?.unit ?? null,
      color: SERIES_COLORS[index % SERIES_COLORS.length],
      reference: result?.data.reference ?? EMPTY_DATA.reference,
      comparison: result?.data.comparison ?? EMPTY_DATA.comparison,
      delta: result ? buildSignalPoints(result.differenceSeries.timeSeconds, result.differenceSeries.delta) : [],
      visible: true,
    };
  }), [props.selections, props.reference.channels, resultById]);
  useEffect(() => {
    if (!tableRange || props.selections.length === 0) return;
    let active = true;
    setTableLoading(true);
    setTableError(null);
    const handle = props.client.queryTable(
      props.reference.id, props.comparison.id,
      props.selections.map((selection, index) => {
        const channel = props.reference.channels.find((item) => item.id === selection.referenceChannelId);
        return { referenceChannelId: selection.referenceChannelId, comparisonChannelId: selection.comparisonChannelId,
          label: channel?.label ?? selection.referenceChannelId, unit: channel?.unit ?? null,
          color: SERIES_COLORS[index % SERIES_COLORS.length] };
      }),
      tableRange.start, tableRange.end, props.offsetSeconds, page, PAGE_SIZE,
    );
    void handle.promise.then((result) => { if (active) setTableResult(result); })
      .catch((cause: unknown) => { if (active && !(cause instanceof DOMException && cause.name === 'AbortError')) setTableError(cause instanceof Error ? cause.message : 'Unable to query measurement table.'); })
      .finally(() => { if (active) setTableLoading(false); });
    return () => { active = false; handle.cancel(); };
  }, [props.client, props.reference, props.comparison, props.selections, props.offsetSeconds, tableRange, page]);

  useEffect(() => { setPage(0); }, [tableRange?.start, tableRange?.end, props.reference.id, props.comparison.id]);
  const pageCount = Math.max(1, Math.ceil((tableResult?.totalRows ?? 0) / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows: readonly TableQueryRow[] = tableResult?.rows ?? [];


  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-4" data-testid="plot-workspace">
      <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <Metric label="Timestamp rows / run" value={props.reference.sampleCount.toLocaleString()} detail={`Ref ${props.reference.sampleCount.toLocaleString()} · Cmp ${props.comparison.sampleCount.toLocaleString()} · ${((props.reference.sampleCount + props.comparison.sampleCount)).toLocaleString()} total`} />
        <Metric label="Valid channel samples" value={(ingestionSummary?.totalValidChannelSamples ?? 0).toLocaleString()} detail="Across both recordings; missing cells excluded" />
        <Metric label="CSV ingestion" value={props.ingestionMetrics ? `${(props.ingestionMetrics.durationMs / 1000).toFixed(2)} s` : '—'} detail={ingestionSummary ? `${(ingestionSummary.totalBytes / 1_048_576).toFixed(1)} MiB input · ${formatIngestionRates(ingestionSummary)}` : 'Concurrent parse + canonical storage'} />
        <Metric label="Retained typed-array memory" value={props.reference.retainedStorageBytes !== undefined && props.comparison.retainedStorageBytes !== undefined ? `${((props.reference.retainedStorageBytes + props.comparison.retainedStorageBytes) / 1_048_576).toFixed(1)} MiB` : 'Unavailable'} detail={`Values ${(((props.reference.channelValueBytes ?? 0) + (props.comparison.channelValueBytes ?? 0)) / 1_048_576).toFixed(1)} MiB · indexes ${(((props.reference.envelopeIndexBytes ?? 0) + (props.comparison.envelopeIndexBytes ?? 0)) / 1_048_576).toFixed(1)} MiB · axes ${(((props.reference.timeAxisBytes ?? 0) + (props.comparison.timeAxisBytes ?? 0)) / 1_048_576).toFixed(1)} MiB`} />
        <Metric label="Initial viewport prep" value={initialPreparationMs === null ? (loading ? 'Preparing…' : '—') : `${initialPreparationMs.toFixed(2)} ms`} detail="Worker round-trip + plot-series preparation" />
        <Metric label="UI FPS" value={interactionFps === null ? '—' : String(interactionFps)} detail="Observed requestAnimationFrame cadence" />
      </div>

      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      {!error && !loading && results.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No samples are available in the selected time interval.</p>}

      <section
        className="h-[calc(var(--signal-panel-count)*200px+58px)] shrink-0 sm:h-[calc(var(--signal-panel-count)*220px+58px)]"
        style={{ '--signal-panel-count': Math.max(1, panels.length) } as CSSProperties}
        aria-label="Synchronized signal charts"
      >
        <EChartsSignalChart
          key={`${selectionKey}:${props.offsetSeconds}:${props.startSeconds}:${props.endSeconds}`}
          panels={panels}
          domainStartSeconds={props.startSeconds}
          domainEndSeconds={props.endSeconds}
          onViewportChange={requestViewport}
          onTableViewportChange={onTableViewportChange}
          onFpsChange={setInteractionFps}
        />
      </section>

      <section className="flex min-h-0 flex-col border-t pt-3" aria-label="Measurement samples">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Measurement data</h2>
            <p className="text-xs text-muted-foreground">Raw worker samples for the independent table viewport · {(tableResult?.totalRows ?? 0).toLocaleString()} rows</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{tableLoading ? 'Loading… · ' : ''}Page {safePage + 1} of {pageCount}</span>
            <Button size="xs" variant="outline" disabled={safePage === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</Button>
            <Button size="xs" variant="outline" disabled={safePage + 1 >= pageCount} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}>Next</Button>
          </div>
        </div>
        <div className="max-h-[min(30dvh,360px)] min-h-32 overflow-auto rounded-md border" data-testid="measurement-table-scroll">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background [&_tr]:bg-background">
              <TableRow><TableHead>Time (s)</TableHead><TableHead>Signal</TableHead><TableHead className="text-right">Reference</TableHead><TableHead className="text-right">Comparison</TableHead><TableHead className="text-right">Δ (Ref − Comp)</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((row, index) => <TableRow key={`${row.signalId}:${row.timeSeconds}:${index}`}>
                <TableCell className="whitespace-nowrap font-mono text-xs tabular-nums">{TIME_FORMATTER.format(row.timeSeconds)}</TableCell>
                <TableCell className="whitespace-nowrap"><span className="mr-2 inline-block size-2 rounded-full" style={{ backgroundColor: row.color }} /><span className="font-medium">{row.signalLabel}</span><span className="ml-2 text-xs text-muted-foreground">{row.unit ?? ''}</span></TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums">{formatMeasurementValue(row.reference)}</TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums">{formatMeasurementValue(row.comparison)}</TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums">{formatMeasurementValue(row.delta)}</TableCell>
              </TableRow>)}
              {pageRows.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">{tableError ?? (tableLoading ? 'Loading table samples…' : 'No samples in this interval.')}</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
        {tableRange && <p className="mt-2 text-[11px] text-muted-foreground">Table range {TIME_FORMATTER.format(tableRange.start)}–{TIME_FORMATTER.format(tableRange.end)} s · end exclusive</p>}
      </section>
    </div>
  );
}

function Metric({ label, value, detail }: { readonly label: string; readonly value: string; readonly detail?: string }) {
  return <div className="rounded-md border px-3 py-2"><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-1 font-mono text-sm font-semibold tabular-nums">{value}</p>{detail && <p className="mt-0.5 text-[10px] text-muted-foreground">{detail}</p>}</div>;
}
