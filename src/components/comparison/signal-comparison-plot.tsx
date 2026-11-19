'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { DatasetDescriptor } from '@/features/measurements/model';
import { formatMeasurementValue } from '@/features/measurements/formatting';
import { formatIngestionRates, summarizeIngestion } from '@/features/comparison/performance-metrics';
import { buildSignalChartPanels } from '@/features/comparison/chart/signal-panels';
import type { MeasurementWorkerClient } from '@/features/ingestion/measurement-worker.client';
import type { SignalSelection } from '@/features/comparison/types';
import { useSignalViewport } from '@/features/comparison/use-signal-viewport';
import { useMeasurementTable } from '@/features/comparison/table/use-measurement-table';
import { getInitialVisibleFraction } from '@/features/comparison/initial-viewport';
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

const TIME_FORMATTER = new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 });

export function SignalComparisonPlot(props: SignalComparisonPlotProps) {
  const { loading, error, results, requestViewport, selectionKey, initialPreparation } = useSignalViewport(props);
  const ingestionSummary = props.ingestionMetrics ? summarizeIngestion(props.reference, props.comparison, props.ingestionMetrics) : null;
  const table = useMeasurementTable({
    client: props.client,
    reference: props.reference,
    comparison: props.comparison,
    selections: props.selections,
    offsetSeconds: props.offsetSeconds,
  });
  const onTableViewportChange = table.setViewportRange;
  const [interactionFps, setInteractionFps] = useState<number | null>(null);
  const panels = useMemo(
    () => buildSignalChartPanels(props.selections, props.reference.channels, results),
    [props.selections, props.reference.channels, results],
  );
  const initialVisibleFraction = getInitialVisibleFraction(Math.max(props.reference.sampleCount, props.comparison.sampleCount));


  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-4" data-testid="plot-workspace">
      <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <Metric label="Timestamp rows / run" value={props.reference.sampleCount.toLocaleString()} detail={`Ref ${props.reference.sampleCount.toLocaleString()} · Cmp ${props.comparison.sampleCount.toLocaleString()} · ${((props.reference.sampleCount + props.comparison.sampleCount)).toLocaleString()} total`} />
        <Metric label="Valid channel samples" value={(ingestionSummary?.totalValidChannelSamples ?? 0).toLocaleString()} detail="Across both recordings; missing cells excluded" />
        <Metric label="CSV ingestion" value={props.ingestionMetrics ? `${(props.ingestionMetrics.durationMs / 1000).toFixed(2)} s` : '—'} detail={ingestionSummary ? `${(ingestionSummary.totalBytes / 1_048_576).toFixed(1)} MiB input · ${formatIngestionRates(ingestionSummary)}` : 'Concurrent file-import wall time'} />
        <Metric label="Typed-array memory at import" value={props.reference.retainedStorageBytes !== undefined && props.comparison.retainedStorageBytes !== undefined ? `${((props.reference.retainedStorageBytes + props.comparison.retainedStorageBytes) / 1_048_576).toFixed(1)} MiB` : 'Unavailable'} detail={`Values ${(((props.reference.channelValueBytes ?? 0) + (props.comparison.channelValueBytes ?? 0)) / 1_048_576).toFixed(1)} MiB · indexes at import ${(((props.reference.envelopeIndexBytes ?? 0) + (props.comparison.envelopeIndexBytes ?? 0)) / 1_048_576).toFixed(1)} MiB · axes ${(((props.reference.timeAxisBytes ?? 0) + (props.comparison.timeAxisBytes ?? 0)) / 1_048_576).toFixed(1)} MiB`} />
        <Metric label="Initial index build" value={initialPreparation?.indexBuildMs != null ? `${initialPreparation.indexBuildMs.toFixed(2)} ms` : (initialPreparation ? 'Unavailable (worker timing payload)' : (loading ? 'Preparing…' : '—'))} detail="Subset of viewport round-trip; newly built tiers only" />
        <Metric label="Worker compute (excl. index)" value={initialPreparation?.workerComputeMs != null ? `${initialPreparation.workerComputeMs.toFixed(2)} ms` : (initialPreparation ? 'Unavailable (worker timing payload)' : (loading ? 'Preparing…' : '—'))} detail="Includes difference calculation; index build excluded" />
        <Metric label="Difference calculation" value={initialPreparation?.differenceMs != null ? `${initialPreparation.differenceMs.toFixed(2)} ms` : (initialPreparation ? 'Unavailable (worker timing payload)' : (loading ? 'Preparing…' : '—'))} detail="Subset of worker compute; do not add again" />
        <Metric label="Viewport round-trip" value={initialPreparation ? `${initialPreparation.workerRoundTripMs.toFixed(2)} ms` : (loading ? 'Preparing…' : '—')} detail="Includes index build + worker compute + response transfer" />
        <Metric label="Plot-series prep" value={initialPreparation ? `${initialPreparation.plotSeriesMs.toFixed(2)} ms` : (loading ? 'Preparing…' : '—')} detail="Main-thread work; included in import + viewport data prep" />
        <Metric label="Import + viewport data prep" value={initialPreparation && props.ingestionMetrics ? `${(props.ingestionMetrics.durationMs + initialPreparation.postImportViewportPrepMs).toFixed(2)} ms` : '—'} detail="CSV import + viewport round-trip + plot prep; excludes chart startup and paint" />
        <Metric label="Interaction RAF cadence" value={interactionFps === null ? '—' : String(interactionFps)} detail="requestAnimationFrame rate during recent interaction; not a paint-FPS measurement" />
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
          initialVisibleFraction={initialVisibleFraction}
          onViewportChange={requestViewport}
          onTableViewportChange={onTableViewportChange}
          onFpsChange={setInteractionFps}
        />
      </section>

      <section className="flex min-h-0 flex-col border-t pt-3" aria-label="Measurement samples">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Measurement data</h2>
            <p className="text-xs text-muted-foreground">Raw worker samples for the independent table viewport · {(table.result?.totalRows ?? 0).toLocaleString()} rows</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{table.loading ? 'Loading… · ' : ''}Page {table.page + 1} of {table.pageCount}</span>
            <Button size="xs" variant="outline" disabled={table.page === 0} onClick={table.previousPage}>Previous</Button>
            <Button size="xs" variant="outline" disabled={table.page + 1 >= table.pageCount} onClick={table.nextPage}>Next</Button>
          </div>
        </div>
        <div className="max-h-[min(30dvh,360px)] min-h-32 overflow-auto rounded-md border" data-testid="measurement-table-scroll">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background [&_tr]:bg-background">
              <TableRow><TableHead>Time (s)</TableHead><TableHead>Signal</TableHead><TableHead className="text-right">Reference</TableHead><TableHead className="text-right">Comparison</TableHead><TableHead className="text-right">Δ (Ref − Comp)</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {table.rows.map((row, index) => <TableRow key={`${row.signalId}:${row.timeSeconds}:${index}`}>
                <TableCell className="whitespace-nowrap font-mono text-xs tabular-nums">{TIME_FORMATTER.format(row.timeSeconds)}</TableCell>
                <TableCell className="whitespace-nowrap"><span className="mr-2 inline-block size-2 rounded-full" style={{ backgroundColor: row.color }} /><span className="font-medium">{row.signalLabel}</span><span className="ml-2 text-xs text-muted-foreground">{row.unit ?? ''}</span></TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums">{formatMeasurementValue(row.reference)}</TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums">{formatMeasurementValue(row.comparison)}</TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums">{formatMeasurementValue(row.delta)}</TableCell>
              </TableRow>)}
              {table.rows.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">{table.error ?? (table.loading ? 'Loading table samples…' : 'No samples in this interval.')}</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
        {table.viewport && <p className="mt-2 text-[11px] text-muted-foreground">Table range {TIME_FORMATTER.format(table.viewport.start)}–{TIME_FORMATTER.format(table.viewport.end)} s · end exclusive</p>}
      </section>
    </div>
  );
}

function Metric({ label, value, detail }: { readonly label: string; readonly value: string; readonly detail?: string }) {
  return <div className="rounded-md border px-3 py-2"><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-1 font-mono text-sm font-semibold tabular-nums">{value}</p>{detail && <p className="mt-0.5 text-[10px] text-muted-foreground">{detail}</p>}</div>;
}
