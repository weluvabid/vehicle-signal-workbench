'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import type { DatasetDescriptor } from '@/features/measurements/model';
import { formatChannelStatistics, formatMeasurementValue } from '@/features/measurements/formatting';
import { formatIngestionRates, summarizeIngestion } from '@/features/comparison/performance-metrics';
import { buildSignalChartPanels } from '@/features/comparison/chart/signal-panels';
import type { MeasurementWorkerClient } from '@/features/ingestion/measurement-worker.client';
import type { SignalSelection } from '@/features/comparison/types';
import { useSignalViewport } from '@/features/comparison/use-signal-viewport';
import { useMetricsViewport } from '@/features/comparison/analysis/use-metrics-viewport';
import { getInitialVisibleFraction } from '@/features/comparison/initial-viewport';


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
  const metrics = useMetricsViewport({
    client: props.client,
    reference: props.reference,
    comparison: props.comparison,
    selections: props.selections,
    offsetSeconds: props.offsetSeconds,
  });
  const onMetricsViewportChange = metrics.setViewportRange;
  const panels = useMemo(
    () => buildSignalChartPanels(props.selections, props.reference.channels, results),
    [props.selections, props.reference.channels, results],
  );
  const initialVisibleFraction = getInitialVisibleFraction(Math.max(props.reference.sampleCount, props.comparison.sampleCount));


  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-4" data-testid="plot-workspace">
      <section className="grid shrink-0 gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]" aria-label="Performance instrumentation">
        <div className="min-w-0 space-y-2">
          <div className="flex items-center justify-between"><h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Data scale &amp; ingestion</h2><span className="text-[10px] text-muted-foreground">Both recordings</span></div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label="Timestamp rows / run" value={props.reference.sampleCount.toLocaleString()} detail={`Ref ${props.reference.sampleCount.toLocaleString()} · Cmp ${props.comparison.sampleCount.toLocaleString()}`} />
            <Metric label="Valid channel samples" value={(ingestionSummary?.totalValidChannelSamples ?? 0).toLocaleString()} detail="Missing cells excluded" />
            <Metric label="Generate + ingest" value={props.ingestionMetrics ? `${(props.ingestionMetrics.durationMs / 1000).toFixed(2)} s` : '—'} detail={ingestionSummary ? `${(ingestionSummary.totalBytes / 1_048_576).toFixed(1)} MiB · ${formatIngestionRates(ingestionSummary)}` : 'Browser generation + worker import'} />
            <Metric label="Typed-array footprint" value={props.reference.retainedStorageBytes !== undefined && props.comparison.retainedStorageBytes !== undefined ? `${((props.reference.retainedStorageBytes + props.comparison.retainedStorageBytes) / 1_048_576).toFixed(1)} MiB` : 'Unavailable'} detail={`Values ${(((props.reference.channelValueBytes ?? 0) + (props.comparison.channelValueBytes ?? 0)) / 1_048_576).toFixed(1)} · indexes ${(((props.reference.envelopeIndexBytes ?? 0) + (props.comparison.envelopeIndexBytes ?? 0)) / 1_048_576).toFixed(1)} · axes ${(((props.reference.timeAxisBytes ?? 0) + (props.comparison.timeAxisBytes ?? 0)) / 1_048_576).toFixed(1)} MiB`} />
          </div>
        </div>
        <div className="min-w-0 space-y-2">
          <div className="flex items-center justify-between"><h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Interactive compute</h2><span className="text-[10px] text-muted-foreground">Worker timings</span></div>
          <div className="grid grid-cols-2 gap-2">
            <Metric label="Initial viewport" value={initialPreparation ? `${initialPreparation.workerRoundTripMs.toFixed(2)} ms` : (loading ? 'Preparing…' : '—')} detail={initialPreparation ? `Cold index build ${initialPreparation.indexBuildMs?.toFixed(2) ?? '—'} ms included` : 'Worker request through response'} />
            <Metric label="Worker compute · median" value={metrics.workerCompute ? `${metrics.workerCompute.medianMs.toFixed(2)} ms` : '—'} detail={metrics.loading ? 'Querying settled channel analysis' : metrics.workerCompute ? `P95 ${metrics.workerCompute.p95Ms.toFixed(2)} ms · ${metrics.workerCompute.count} queries` : 'Waiting for settled zoom'} />
          </div>
        </div>
      </section>

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
          onMetricsViewportChange={onMetricsViewportChange}
        />
      </section>

      <section className="flex min-h-0 flex-col gap-4 border-t pt-4" aria-label="Channel analysis">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Channel analysis</h2>
            <p className="text-xs text-muted-foreground">
              Indexed statistics for the selected interval
              {metrics.viewport ? ` · ${TIME_FORMATTER.format(metrics.viewport.start)}–${TIME_FORMATTER.format(metrics.viewport.end)} s` : ''}
            </p>
          </div>
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {metrics.loading ? 'Updating metrics…' : metrics.error ? 'Metrics unavailable' : metrics.result ? 'Current interval' : 'Waiting for range'}
          </span>
        </div>
        {metrics.error && <p className="text-sm text-destructive" role="alert">{metrics.error}</p>}
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {props.selections.map((selection, index) => {
            const panel = metrics.result?.panels[index];
            const channel = props.reference.channels.find((item) => item.id === selection.referenceChannelId);
            const label = channel?.label ?? selection.referenceChannelId;
            const unit = channel?.unit;
            const reference = panel ? formatChannelStatistics(panel.referenceStatistics) : null;
            const comparison = panel ? formatChannelStatistics(panel.comparisonStatistics) : null;
            const difference = panel?.differenceStatistics;
            const metric = (name: string, ref: string, cmp: string) => (
              <div className="rounded-md border bg-background/40 px-3 py-2" key={name}>
                <p className="text-[11px] text-muted-foreground">{name}</p>
                <div className="mt-1 grid grid-cols-2 gap-2 text-xs tabular-nums">
                  <span className="font-mono">{ref}</span><span className="font-mono">{cmp}</span>
                </div>
              </div>
            );
            return (
              <article key={`${selection.referenceChannelId}:${selection.comparisonChannelId}`} className="min-w-0 rounded-xl border bg-card/40 p-3 sm:p-4">
                <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: ['#a1a1aa', '#60a5fa', '#d6a85f', '#34d399', '#c084fc', '#f472b6'][index % 6] }} />
                    <h3 className="truncate text-sm font-semibold">{label}</h3>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{unit ?? '—'}</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">{difference?.matchedCount.toLocaleString() ?? '—'} matched</span>
                </header>
                <div className="overflow-hidden rounded-lg border">
                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] border-b bg-muted/30 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <span>Measurement</span><span>Reference</span><span>Comparison</span>
                  </div>
                  {[
                    ['Minimum', reference?.min ?? '—', comparison?.min ?? '—'],
                    ['Maximum', reference?.max ?? '—', comparison?.max ?? '—'],
                    ['Average', reference?.mean ?? '—', comparison?.mean ?? '—'],
                    ['Std deviation', reference?.standardDeviation ?? '—', comparison?.standardDeviation ?? '—'],
                    ['Valid samples', reference?.valid ?? '—', comparison?.valid ?? '—'],
                    ['Missing samples', reference?.missing ?? '—', comparison?.missing ?? '—'],
                  ].map(([name, ref, cmp]) => (
                    <div key={name} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] border-b px-3 py-2 last:border-b-0">
                      <span className="text-xs text-muted-foreground">{name}</span><span className="font-mono text-xs tabular-nums">{ref}</span><span className="font-mono text-xs tabular-nums">{cmp}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 border-t pt-3">
                  <h4 className="mb-2 text-xs font-semibold">Comparison analysis</h4>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <AnalysisValue label="Bias" value={formatMeasurementValue(difference?.bias ?? null)} />
                    <AnalysisValue label="MAE" value={formatMeasurementValue(difference?.meanAbsoluteError ?? null)} />
                    <AnalysisValue label="RMSE" value={formatMeasurementValue(difference?.rootMeanSquareError ?? null)} />
                    <AnalysisValue label="Maximum deviation" value={formatMeasurementValue(difference?.maximumAbsoluteError ?? null)} />
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <CoverageValue label="Matched" value={difference?.matchedCount.toLocaleString() ?? '—'} />
                    <CoverageValue label="Unavailable" value={difference?.unavailableCount.toLocaleString() ?? '—'} />
                    <CoverageValue label="Match coverage" value={difference ? `${((difference.matchedCount / Math.max(1, difference.matchedCount + difference.unavailableCount)) * 100).toFixed(2)}%` : '—'} />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function AnalysisValue({ label, value }: { readonly label: string; readonly value: string }) {
  return <div className="rounded-md border bg-muted/25 px-3 py-2"><p className="text-[10px] text-muted-foreground">{label}</p><p className="mt-1 font-mono text-sm font-semibold tabular-nums">{value}</p></div>;
}

function CoverageValue({ label, value }: { readonly label: string; readonly value: string }) {
  return <div className="rounded-md bg-muted/20 px-3 py-2"><p className="text-[10px] text-muted-foreground">{label}</p><p className="mt-1 font-mono text-xs font-medium tabular-nums">{value}</p></div>;
}

function Metric({ label, value, detail }: { readonly label: string; readonly value: string; readonly detail?: string }) {
  return <div className="min-w-0 rounded-lg border bg-card/45 px-3 py-2.5"><p className="truncate text-[10px] text-muted-foreground">{label}</p><p className="mt-1 font-mono text-sm font-semibold tabular-nums">{value}</p>{detail && <p className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-muted-foreground">{detail}</p>}</div>;
}
