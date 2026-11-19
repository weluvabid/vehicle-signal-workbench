'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { DatasetDescriptor } from '@/features/measurements/model';
import { formatChannelStatistics, formatMeasurementValue } from '@/features/measurements/formatting';
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


  const retainedBytes = (props.reference.retainedStorageBytes ?? 0) + (props.comparison.retainedStorageBytes ?? 0);
  const totalRows = props.reference.sampleCount + props.comparison.sampleCount;
  const validChannelSamples = [props.reference, props.comparison].reduce(
    (total, dataset) => total + dataset.channels.reduce(
      (channelTotal, channel) => channelTotal + channel.sampleCount - channel.missingSampleCount,
      0,
    ),
    0,
  );
  const ingestionSeconds = (props.ingestionMetrics?.ingestionDurationMs ?? 0) / 1_000;
  const formatRate = (value: number) => Number.isFinite(value) && value >= 0
    ? `${(value / 1_000_000).toFixed(2)}M`
    : '—';
  const throughput = ingestionSeconds > 0
    ? `${formatRate(totalRows / ingestionSeconds)} rows/s · ${formatRate(validChannelSamples / ingestionSeconds)} samples/s`
    : '—';

  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-4 pb-2" data-testid="plot-workspace">
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      {!error && !loading && results.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No samples are available in the selected time interval.</p>}

      <section
        className="h-[calc(var(--signal-panel-count)*260px+58px)] shrink-0 sm:h-[calc(var(--signal-panel-count)*300px+58px)] lg:h-[calc(var(--signal-panel-count)*320px+58px)]"
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
      <LivePerformanceDock
        fps={fps}
        ingestion={props.ingestionMetrics ? `${(props.ingestionMetrics.ingestionDurationMs / 1000).toFixed(2)} s` : '—'}
        throughput={throughput}
        memory={retainedBytes > 0 ? `${(retainedBytes / 1_048_576).toFixed(1)} MiB` : '—'}
        rows={totalRows.toLocaleString()}
      />
    </div>
  );
}

function LivePerformanceDock({ fps, ingestion, throughput, memory, rows }: { readonly fps: number | null; readonly ingestion: string; readonly throughput: string; readonly memory: string; readonly rows: string }) {
  const items = [
    { label: 'Frame rate', value: fps === null ? '—' : String(fps), unit: 'FPS', detail: 'Live rendering' },
    { label: 'CSV ingestion', value: ingestion, unit: '', detail: throughput },
    { label: 'Typed-array memory', value: memory, unit: '', detail: 'Retained measurement buffers' },
    { label: 'Timestamp rows', value: rows, unit: '', detail: 'Across both recordings' },
  ];

  return (
    <section
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-background/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_32px_rgb(0_0_0/0.18)] backdrop-blur-xl"
      aria-label="Live performance"
      data-testid="live-performance-dock"
    >
      <div className="w-full px-5 py-3 sm:px-8 sm:py-4 lg:px-10">
        <h2 className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Live performance</h2>
        <div className="-mx-5 overflow-x-auto overscroll-x-contain px-5 [scrollbar-width:thin] sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10">
          <div className="flex min-w-max items-start justify-between gap-8 sm:min-w-0 sm:gap-6 lg:gap-10">
            {items.map((item) => (
              <div key={item.label} className="min-w-[10.5rem] flex-1 sm:min-w-0">
                <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground sm:text-[11px]">{item.label}</p>
                <p className="mt-0.5 truncate font-mono text-base font-medium tabular-nums sm:text-xl">
                  {item.value}{item.unit && <span className="ml-1 text-xs font-normal text-muted-foreground">{item.unit}</span>}
                </p>
                <p className="mt-0.5 truncate text-[10px] text-muted-foreground/75 sm:text-[11px]">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
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
