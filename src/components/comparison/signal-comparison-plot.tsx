'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import type { DatasetDescriptor } from '@/features/measurements/model';
import type { ComparisonPlotData, SignalPoint } from '@/features/measurements/plot-data';
import { formatMeasurementValue } from '@/features/measurements/formatting';
import { buildSignalPoints } from '@/features/measurements/plot-data';
import type { MeasurementWorkerClient } from '@/features/ingestion/measurement-worker.client';
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

interface TableRowData {
  readonly timeSeconds: number;
  readonly signalId: string;
  readonly signalLabel: string;
  readonly unit: string | null;
  readonly color: string;
  readonly reference: number | null;
  readonly comparison: number | null;
  readonly delta: number | null;
}

const EMPTY_DATA: ComparisonPlotData = { reference: [], comparison: [] };
const SERIES_COLORS = ['#a1a1aa', '#60a5fa', '#d6a85f', '#34d399', '#c084fc', '#f472b6'];
const TIME_FORMATTER = new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 });
const PAGE_SIZE = 100;

function buildRows(panels: readonly {
  id: string; label: string; unit: string | null; color: string;
  reference: SignalPoint[]; comparison: SignalPoint[]; delta: SignalPoint[];
}[]): TableRowData[] {
  const rows: TableRowData[] = [];
  for (const panel of panels) {
    const byTime = new Map<number, { reference: number | null; comparison: number | null; delta: number | null }>();
    for (const [time, value] of panel.reference) byTime.set(time, { ...(byTime.get(time) ?? { reference: null, comparison: null, delta: null }), reference: value });
    for (const [time, value] of panel.comparison) byTime.set(time, { ...(byTime.get(time) ?? { reference: null, comparison: null, delta: null }), comparison: value });
    for (const [time, value] of panel.delta) byTime.set(time, { ...(byTime.get(time) ?? { reference: null, comparison: null, delta: null }), delta: value });
    for (const [timeSeconds, values] of byTime) rows.push({ timeSeconds, signalId: panel.id, signalLabel: panel.label, unit: panel.unit, color: panel.color, ...values });
  }
  rows.sort((a, b) => a.timeSeconds - b.timeSeconds || a.signalLabel.localeCompare(b.signalLabel));
  return rows;
}

export function SignalComparisonPlot(props: SignalComparisonPlotProps) {
  const { loading, error, results, resultsRange, requestViewport, selectionKey, initialPreparationMs, interactionQueryMs, interactionLoading } = useSignalViewport(props);
  const [page, setPage] = useState(0);
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
  const rows = useMemo(() => buildRows(panels), [panels]);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = rows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const visiblePoints = panels.reduce((sum, panel) => sum + panel.reference.length + panel.comparison.length, 0);

  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-4" data-testid="plot-workspace">
      <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-5">
        <Metric label="Samples / run" value={props.reference.sampleCount.toLocaleString()} />
        <Metric label="CSV ingestion" value={props.ingestionMetrics ? `${(props.ingestionMetrics.durationMs / 1000).toFixed(2)} s` : '—'} detail={props.ingestionMetrics ? `${(props.ingestionMetrics.totalBytes / 1_048_576).toFixed(1)} MiB · ${((props.reference.sampleCount + props.comparison.sampleCount) / Math.max(props.ingestionMetrics.durationMs / 1000, 0.001) / 1_000_000).toFixed(2)}M rows/s` : 'Parse + typed-array ingestion'} />
        <Metric label="Initial viewport prep" value={initialPreparationMs === null ? (loading ? 'Preparing…' : '—') : `${initialPreparationMs.toFixed(2)} ms`} detail="First query + series preparation" />
        <Metric label="Interaction query" value={interactionLoading ? 'Updating…' : interactionQueryMs === null ? 'Interact with chart' : `${interactionQueryMs.toFixed(2)} ms`} detail="Latest zoom / pan query" />
        <Metric label="UI FPS" value={interactionFps === null ? 'Interact with chart' : String(interactionFps)} />
      </div>

      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      {!error && !loading && rows.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No samples are available in the selected time interval.</p>}

      <section className="h-[58dvh] min-h-[420px] max-h-[760px] shrink-0" aria-label="Synchronized signal charts">
        <EChartsSignalChart
          key={`${selectionKey}:${props.offsetSeconds}:${props.startSeconds}:${props.endSeconds}`}
          panels={panels}
          domainStartSeconds={props.startSeconds}
          domainEndSeconds={props.endSeconds}
          onViewportChange={requestViewport}
          onFpsChange={setInteractionFps}
        />
      </section>

      <section className="flex min-h-0 flex-col border-t pt-3" aria-label="Measurement samples">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Measurement data</h2>
            <p className="text-xs text-muted-foreground">Bounded samples for the current chart viewport · {rows.length.toLocaleString()} rows</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Page {safePage + 1} of {pageCount}</span>
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
              {pageRows.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Waiting for viewport samples…</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
        {resultsRange && <p className="mt-2 text-[11px] text-muted-foreground">Time range {TIME_FORMATTER.format(resultsRange.start)}–{TIME_FORMATTER.format(resultsRange.end)} s · end exclusive</p>}
      </section>
    </div>
  );
}

function Metric({ label, value, detail }: { readonly label: string; readonly value: string; readonly detail?: string }) {
  return <div className="rounded-md border px-3 py-2"><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-1 font-mono text-sm font-semibold tabular-nums">{value}</p>{detail && <p className="mt-0.5 text-[10px] text-muted-foreground">{detail}</p>}</div>;
}
