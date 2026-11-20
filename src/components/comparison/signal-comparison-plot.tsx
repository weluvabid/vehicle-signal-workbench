'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { DatasetDescriptor } from '@/features/measurements/model';
import { buildSignalChartPanels } from '@/features/comparison/chart/signal-panels';
import type { MeasurementWorkerClient } from '@/features/ingestion/measurement-worker.client';
import type { SignalSelection } from '@/features/comparison/types';
import { useSignalViewport } from '@/features/comparison/use-signal-viewport';
import { useMetricsViewport } from '@/features/comparison/analysis/use-metrics-viewport';
import { getInitialVisibleFraction } from '@/features/comparison/initial-viewport';
import { calculateComparisonPerformanceMetrics, type IngestionMetrics } from '@/features/comparison/performance/metrics';
import { COMPARISON_LABELS as LABELS } from '@/constants/comparison-labels';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChannelAnalysisCard } from '@/components/comparison/analysis/channel-analysis-card';
import { TimelineZoomControls } from '@/components/comparison/timeline-zoom-controls';
import { LivePerformanceMonitor } from '@/components/comparison/performance/live-performance-dock';

const EChartsSignalChart = dynamic(
  () => import('./echarts-signal-chart').then((module) => module.EChartsSignalChart),
  { ssr: false, loading: () => <p className="py-12 text-center text-sm text-muted-foreground">{LABELS.chartLoading}</p> },
);

interface SignalComparisonPlotProps {
  readonly client: MeasurementWorkerClient;
  readonly reference: DatasetDescriptor;
  readonly comparison: DatasetDescriptor;
  readonly selections: readonly SignalSelection[];
  readonly offsetSeconds: number;
  readonly startSeconds: number;
  readonly endSeconds: number;
  readonly ingestionMetrics: IngestionMetrics | null;
}

const TIME_FORMATTER = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

export function SignalComparisonPlot(props: SignalComparisonPlotProps) {
  const { loading, error, results, requestViewport, selectionKey } = useSignalViewport(props);
  const [activeChannelIndex, setActiveChannelIndex] = useState(0);
  const activeChannelIndexSafe = Math.min(activeChannelIndex, Math.max(0, props.selections.length - 1));
  const metrics = useMetricsViewport({
    client: props.client,
    reference: props.reference,
    comparison: props.comparison,
    selections: props.selections,
    offsetSeconds: props.offsetSeconds,
  });
  const panels = useMemo(
    () => buildSignalChartPanels(props.selections, props.reference.channels, results),
    [props.selections, props.reference.channels, results],
  );
  const initialVisibleFraction = getInitialVisibleFraction(Math.max(props.reference.sampleCount, props.comparison.sampleCount));
  const performance = useMemo(
    () => calculateComparisonPerformanceMetrics(props.reference, props.comparison, props.ingestionMetrics),
    [props.reference, props.comparison, props.ingestionMetrics],
  );

  useEffect(() => {
    setActiveChannelIndex((current) => Math.min(current, Math.max(0, props.selections.length - 1)));
  }, [props.selections.length]);

  return (
    <div className="flex min-h-0 min-w-0 w-full flex-col gap-4 overflow-x-clip pb-2" data-testid="plot-workspace">
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      {!error && !loading && results.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{LABELS.noSamplesInInterval}</p>}

      <section
        className="relative h-[calc(var(--signal-panel-count)*280px+58px)] shrink-0 sm:h-[calc(var(--signal-panel-count)*320px+58px)] lg:h-[calc(var(--signal-panel-count)*340px+58px)]"
        style={{ '--signal-panel-count': Math.max(1, panels.length) } as CSSProperties}
        aria-label={LABELS.chartGroupLabel}
      >
        <div className="pointer-events-none absolute bottom-1 right-2 z-20 sm:right-4">
          <div className="pointer-events-auto">
            <TimelineZoomControls />
          </div>
        </div>
        <EChartsSignalChart
          key={`${selectionKey}:${props.offsetSeconds}:${props.startSeconds}:${props.endSeconds}`}
          panels={panels}
          domainStartSeconds={props.startSeconds}
          domainEndSeconds={props.endSeconds}
          initialVisibleFraction={initialVisibleFraction}
          onViewportChange={requestViewport}
          onMetricsViewportChange={metrics.setViewportRange}
        />
      </section>

      <section className="flex min-h-0 flex-col gap-4 border-t pt-4" aria-label={LABELS.channelAnalysis}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">{LABELS.channelAnalysis}</h2>
            <p className="text-xs text-muted-foreground">
              {LABELS.indexedStatistics}{metrics.viewport ? ` · ${TIME_FORMATTER.format(metrics.viewport.start)}–${TIME_FORMATTER.format(metrics.viewport.end)} s` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground" aria-live="polite">
              {metrics.loading ? LABELS.updatingMetrics : metrics.error ? LABELS.metricsUnavailable : metrics.result ? LABELS.currentInterval : LABELS.waitingForRange}
            </span>
            {props.selections.length > 1 && (
              <div className="flex items-center gap-1" role="group" aria-label={LABELS.channelNavigation}>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={LABELS.previousChannel} disabled={activeChannelIndexSafe === 0} onClick={() => setActiveChannelIndex((current) => Math.max(0, current - 1))}>
                  <ChevronLeft aria-hidden="true" />
                </Button>
                <span className="min-w-10 text-center text-xs tabular-nums text-muted-foreground" aria-live="polite">{activeChannelIndexSafe + 1} / {props.selections.length}</span>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={LABELS.nextChannel} disabled={activeChannelIndexSafe >= props.selections.length - 1} onClick={() => setActiveChannelIndex((current) => Math.min(props.selections.length - 1, current + 1))}>
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
            const channel = props.reference.channels.find((item) => item.id === selection.referenceChannelId);
            return (
              <ChannelAnalysisCard
                key={`${selection.referenceChannelId}:${selection.comparisonChannelId}`}
                selection={selection}
                index={index}
                label={channel?.label ?? selection.referenceChannelId}
                unit={channel?.unit}
                panel={metrics.result?.panels[index]}
              />
            );
          })}
        </div>
      </section>

      <LivePerformanceMonitor ingestion={performance.ingestion} throughput={performance.throughput} memory={performance.memory} rows={performance.rows} />
    </div>
  );
}
