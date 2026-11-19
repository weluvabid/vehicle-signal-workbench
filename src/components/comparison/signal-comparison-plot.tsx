'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  readonly ingestionMetrics: { readonly ingestionDurationMs: number; readonly totalBytes: number } | null;
}

const TIME_FORMATTER = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

function useAnimationFrameRate(): number | null {
  const [fps, setFps] = useState<number | null>(null);
  useEffect(() => {
    let frames = 0;
    let startedAt = 0;
    let frameId = 0;
    let active = true;
    const tick = (now: number) => {
      if (!active) return;
      if (document.visibilityState === 'hidden') {
        frames = 0;
        startedAt = now;
      } else {
        if (startedAt === 0) startedAt = now;
        frames += 1;
        const elapsed = now - startedAt;
        if (elapsed >= 1000) {
          setFps(Math.round((frames * 1000) / elapsed));
          frames = 0;
          startedAt = now;
        }
      }
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => { active = false; cancelAnimationFrame(frameId); };
  }, []);
  return fps;
}

export function SignalComparisonPlot(props: SignalComparisonPlotProps) {
  const { loading, error, results, requestViewport, selectionKey } = useSignalViewport(props);
  const [activeChannelIndex, setActiveChannelIndex] = useState(0);
  const activeChannelIndexSafe = Math.min(activeChannelIndex, Math.max(0, props.selections.length - 1));
  useEffect(() => {
    setActiveChannelIndex((current) => Math.min(current, Math.max(0, props.selections.length - 1)));
  }, [props.selections.length]);
  const fps = useAnimationFrameRate();
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
      <section className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5" aria-label="Ingestion performance">
        <Metric label="Timestamp rows / run" value={props.reference.sampleCount.toLocaleString()} detail={`Ref ${props.reference.sampleCount.toLocaleString()} · Cmp ${props.comparison.sampleCount.toLocaleString()}`} />
        <Metric label="Valid channel samples" value={(ingestionSummary?.totalValidChannelSamples ?? 0).toLocaleString()} detail="Across both recordings" />
        <Metric label="CSV ingestion" value={props.ingestionMetrics ? `${(props.ingestionMetrics.ingestionDurationMs / 1000).toFixed(2)} s` : '—'} detail={ingestionSummary ? `${(ingestionSummary.totalBytes / 1_048_576).toFixed(1)} MiB · ${formatIngestionRates(ingestionSummary)}` : 'Parser + typed-array import'} />
        <Metric label="Typed-array footprint" value={props.reference.retainedStorageBytes !== undefined && props.comparison.retainedStorageBytes !== undefined ? `${((props.reference.retainedStorageBytes + props.comparison.retainedStorageBytes) / 1_048_576).toFixed(1)} MiB` : 'Unavailable'} detail={`Values ${(((props.reference.channelValueBytes ?? 0) + (props.comparison.channelValueBytes ?? 0)) / 1_048_576).toFixed(1)} · indexes ${(((props.reference.envelopeIndexBytes ?? 0) + (props.comparison.envelopeIndexBytes ?? 0)) / 1_048_576).toFixed(1)} · axes ${(((props.reference.timeAxisBytes ?? 0) + (props.comparison.timeAxisBytes ?? 0)) / 1_048_576).toFixed(1)} MiB`} />
        <Metric label="FPS" value={fps === null ? '—' : `${fps}`} detail="Live requestAnimationFrame rate" />
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Channel analysis</h2>
            <p className="text-xs text-muted-foreground">
              Indexed statistics for the selected interval
              {metrics.viewport ? ` · ${TIME_FORMATTER.format(metrics.viewport.start)}–${TIME_FORMATTER.format(metrics.viewport.end)} s` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground" aria-live="polite">
              {metrics.loading ? 'Updating metrics…' : metrics.error ? 'Metrics unavailable' : metrics.result ? 'Current interval' : 'Waiting for range'}
            </span>
            {props.selections.length > 1 && (
              <div className="flex items-center gap-1" aria-label="Channel navigation">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Previous channel"
                  disabled={activeChannelIndexSafe === 0}
                  onClick={() => setActiveChannelIndex((current) => Math.max(0, current - 1))}
                >
                  <ChevronLeft aria-hidden="true" />
                </Button>
                <span className="min-w-10 text-center text-xs tabular-nums text-muted-foreground" aria-live="polite">
                  {activeChannelIndexSafe + 1} / {props.selections.length}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Next channel"
                  disabled={activeChannelIndexSafe >= props.selections.length - 1}
                  onClick={() => setActiveChannelIndex((current) => Math.min(props.selections.length - 1, current + 1))}
                >
                  <ChevronRight aria-hidden="true" />
                </Button>
              </div>
            )}
          </div>
        </div>
        {metrics.error && <p className="text-sm text-destructive" role="alert">{metrics.error}</p>}
        <div className="min-w-0">
          {props.selections.map((selection, index) => {
            if (index !== activeChannelIndexSafe) return null;
            const panel = metrics.result?.panels[index];
            const channel = props.reference.channels.find((item) => item.id === selection.referenceChannelId);
            const label = channel?.label ?? selection.referenceChannelId;
            const unit = channel?.unit;
            const reference = panel ? formatChannelStatistics(panel.referenceStatistics) : null;
            const comparison = panel ? formatChannelStatistics(panel.comparisonStatistics) : null;
            const difference = panel?.differenceStatistics;

            return (
              <Card key={`${selection.referenceChannelId}:${selection.comparisonChannelId}`} size="sm" className="min-w-0 bg-card/40">
                <CardHeader className="flex flex-row items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: ['#a1a1aa', '#60a5fa', '#d6a85f', '#34d399', '#c084fc', '#f472b6'][index % 6] }} />
                    <CardTitle className="truncate text-sm">{label}</CardTitle>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{unit ?? '—'}</span>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{difference?.matchedCount.toLocaleString() ?? '—'} matched</span>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="h-8 px-2 text-[10px] uppercase tracking-wide text-muted-foreground">Measurement</TableHead>
                        <TableHead className="h-8 px-2 text-[10px] uppercase tracking-wide text-muted-foreground">Reference</TableHead>
                        <TableHead className="h-8 px-2 text-[10px] uppercase tracking-wide text-muted-foreground">Comparison</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[
                        ['Minimum', reference?.min ?? '—', comparison?.min ?? '—'],
                        ['Maximum', reference?.max ?? '—', comparison?.max ?? '—'],
                        ['Average', reference?.mean ?? '—', comparison?.mean ?? '—'],
                        ['Std deviation', reference?.standardDeviation ?? '—', comparison?.standardDeviation ?? '—'],
                        ['Valid samples', reference?.valid ?? '—', comparison?.valid ?? '—'],
                        ['Missing samples', reference?.missing ?? '—', comparison?.missing ?? '—'],
                      ].map(([name, ref, cmp]) => (
                        <TableRow key={name}>
                          <TableCell className="px-2 py-2 text-xs text-muted-foreground">{name}</TableCell>
                          <TableCell className="px-2 py-2 font-mono text-xs tabular-nums">{ref}</TableCell>
                          <TableCell className="px-2 py-2 font-mono text-xs tabular-nums">{cmp}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="border-t pt-3">
                    <h4 className="mb-2 text-xs font-semibold">Comparison analysis</h4>
                    <div className="divide-y divide-border/70">
                      <ReceiptRow label="Bias" value={formatMeasurementValue(difference?.bias ?? null)} />
                      <ReceiptRow label="MAE" value={formatMeasurementValue(difference?.meanAbsoluteError ?? null)} />
                      <ReceiptRow label="RMSE" value={formatMeasurementValue(difference?.rootMeanSquareError ?? null)} />
                      <ReceiptRow label="Maximum deviation" value={formatMeasurementValue(difference?.maximumAbsoluteError ?? null)} />
                    </div>
                    <div className="mt-3 border-t pt-2">
                      <div className="divide-y divide-border/70">
                        <ReceiptRow label="Matched" value={difference?.matchedCount.toLocaleString() ?? '—'} />
                        <ReceiptRow label="Unavailable" value={difference?.unavailableCount.toLocaleString() ?? '—'} />
                        <ReceiptRow label="Match coverage" value={difference ? `${((difference.matchedCount / Math.max(1, difference.matchedCount + difference.unavailableCount)) * 100).toFixed(2)}%` : '—'} />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function ReceiptRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-right font-mono text-sm font-medium tabular-nums">{value}</span>
    </div>
  );
}

function Metric({ label, value, detail }: { readonly label: string; readonly value: string; readonly detail?: string }) {
  return (
    <Card size="sm" className="min-w-0 bg-card/45">
      <CardContent className="space-y-1">
        <p className="truncate text-[10px] text-muted-foreground">{label}</p>
        <p className="font-mono text-sm font-semibold tabular-nums">{value}</p>
        {detail && <p className="line-clamp-2 text-[10px] leading-4 text-muted-foreground">{detail}</p>}
      </CardContent>
    </Card>
  );
}
