'use client';

import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import {
  AriaComponent,
  AxisPointerComponent,
  DataZoomInsideComponent,
  DataZoomSliderComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  TitleComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from 'react';
import type { SignalChartPanel } from './signal-chart-types';
import { createSignalChartOption } from './echarts-options';
import { useEChartsSignalChart } from '@/features/comparison/chart/use-echarts-signal-chart';
import { useChartInteractions } from '@/features/comparison/chart/use-chart-interactions';
import { Card, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Maximize2, X } from 'lucide-react';
import { getSignalSummary } from './chart-summary';
import { formatChartValue } from './chart-value-format';
import { COMPARISON_LABELS as LABELS } from '@/constants/comparison-labels';
import { CHART_INTENTS } from '@/intents/chart-intents';

const ECHARTS_OPTIONS = { renderer: 'canvas' as const };
const CHART_STYLE = { width: '100%', height: '100%' };

function createPointerTimeStore() {
  let value: number | null = null;
  return {
    get: () => value,
    set: (next: number | null) => {
      value = next;
    },
  };
}

echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  TitleComponent,
  AriaComponent,
  AxisPointerComponent,
  LegendComponent,
  DataZoomInsideComponent,
  DataZoomSliderComponent,
  CanvasRenderer,
]);

interface EChartsSignalChartProps {
  readonly panels: readonly SignalChartPanel[];
  readonly domainStartSeconds: number;
  readonly domainEndSeconds: number;
  readonly initialVisibleFraction: number;
  readonly onViewportChange: (startSeconds: number, endSeconds: number, pixelWidth: number) => void;
  readonly onMetricsViewportChange: (
    startSeconds: number,
    endSeconds: number,
    isInitial: boolean,
  ) => void;
}

function EChartsSignalChartComponent({
  panels,
  domainStartSeconds,
  domainEndSeconds,
  initialVisibleFraction,
  onViewportChange,
  onMetricsViewportChange,
}: EChartsSignalChartProps) {
  // Keep high-frequency pointer updates outside React state and render-time refs.
  const pointerTime = useMemo(() => createPointerTimeStore(), []);
  const [cursorTime, setCursorTime] = useState<number | null>(null);
  const [horizontalZoomInitialized, setHorizontalZoomInitialized] = useState(false);
  const [visiblePercent, setVisiblePercent] = useState({ start: 0, end: 100 });
  const [expandedPanelId, setExpandedPanelId] = useState<string | null>(null);
  const cursorFrame = useRef<number | null>(null);
  const [seriesVisibility, setSeriesVisibility] = useState<
    Record<string, { reference: boolean; comparison: boolean }>
  >({});
  const visiblePanels = useMemo(
    () =>
      panels.map((panel) => ({
        ...panel,
        referenceVisible: seriesVisibility[panel.id]?.reference ?? true,
        comparisonVisible: seriesVisibility[panel.id]?.comparison ?? true,
      })),
    [panels, seriesVisibility],
  );
  const chartPanels = useMemo(
    () =>
      expandedPanelId === null
        ? visiblePanels
        : visiblePanels.filter((panel) => panel.id === expandedPanelId),
    [expandedPanelId, visiblePanels],
  );
  const handleToggleSeries = useCallback(
    (panelId: string, series: 'reference' | 'comparison') => {
      setSeriesVisibility((current) => ({
        ...current,
        [panelId]: {
          reference:
            series === 'reference'
              ? !(current[panelId]?.reference ?? true)
              : (current[panelId]?.reference ?? true),
          comparison:
            series === 'comparison'
              ? !(current[panelId]?.comparison ?? true)
              : (current[panelId]?.comparison ?? true),
        },
      }));
    },
    [],
  );
  const getPointerTime = useCallback(() => pointerTime.get(), [pointerTime]);
  const handleAxisPointer = useCallback(
    (event: unknown) => {
      if (!event || typeof event !== 'object') return;

      const axesInfo = (
        event as { axesInfo?: Array<{ axisDim?: string; value?: string | number }> }
      ).axesInfo;
      const value = axesInfo?.find((axis) => axis.axisDim === 'x')?.value ?? axesInfo?.[0]?.value;
      const time = Number(value);
      pointerTime.set(value !== undefined && Number.isFinite(time) ? time : null);

      if (cursorFrame.current === null)
        cursorFrame.current = requestAnimationFrame(() => {
          cursorFrame.current = null;
          setCursorTime(pointerTime.get());
        });
    },
    [pointerTime],
  );
  const clearPointerTime = useCallback(() => {
    pointerTime.set(null);

    if (cursorFrame.current === null)
      cursorFrame.current = requestAnimationFrame(() => {
        cursorFrame.current = null;
        setCursorTime(null);
      });
  }, [pointerTime]);

  const { attachChart } = useChartInteractions({
    panelCount: panels.length,
  });

  const {
    container,
    chartHeight,
    measuredWidth,
    registerChart,
    requestInitialViewport,
    handleDataZoom,
  } = useEChartsSignalChart({
    domainStartSeconds,
    domainEndSeconds,
    initialVisibleFraction,
    onViewportChange,
    onMetricsViewportChange,
    hasPanels: panels.length > 0,
  });

  const handleDataZoomWithSummary = useCallback(
    (event: unknown) => {
      if (event && typeof event === 'object') {
        const candidate = event as {
          start?: number;
          end?: number;
          batch?: Array<{ start?: number; end?: number; dataZoomId?: string }>;
        };
        const range =
          candidate.batch?.find(
            (item) =>
              item.dataZoomId === 'viewport-inside' || item.dataZoomId === 'viewport-slider',
          ) ?? candidate;

        if (typeof range.start === 'number' && typeof range.end === 'number') {
          setVisiblePercent({ start: range.start, end: range.end });
          window.dispatchEvent(
            new CustomEvent(CHART_INTENTS.HORIZONTAL_ZOOM_CHANGED, {
              detail: { factor: Math.min(20, 100 / Math.max(5, range.end - range.start)) },
            }),
          );
        }
      }

      handleDataZoom(event as Parameters<typeof handleDataZoom>[0]);
    },
    [handleDataZoom],
  );

  const chartEvents = useMemo(
    () => ({
      datazoom: handleDataZoomWithSummary,
      updateAxisPointer: handleAxisPointer,
      globalout: clearPointerTime,
    }),
    [handleDataZoomWithSummary, handleAxisPointer, clearPointerTime],
  );

  type EChartsReactInstance = Parameters<
    NonNullable<ComponentProps<typeof ReactEChartsCore>['onChartReady']>
  >[0];

  const handleChartReady = useCallback(
    (chart: EChartsReactInstance) => {
      setHorizontalZoomInitialized(true);
      registerChart(chart);
      // echarts-for-react and echarts/core resolve separate ECharts declarations
      // in ECharts 6. The runtime instance is shared; adapt at this boundary.
      attachChart(chart as unknown as echarts.EChartsType);
      requestInitialViewport(chart);
    },
    [attachChart, registerChart, requestInitialViewport],
  );

  // Seed the horizontal viewport on the first option only. Once ECharts is
  // initialized, data-only option updates must preserve its interactive range.
  const option = useMemo(
    () =>
      measuredWidth > 0 && chartHeight > 0
        ? createSignalChartOption(
            chartPanels,
            domainStartSeconds,
            domainEndSeconds,
            chartHeight,
            measuredWidth,
            initialVisibleFraction,
            getPointerTime,
            !horizontalZoomInitialized,
          )
        : null,
    [
      chartHeight,
      domainEndSeconds,
      domainStartSeconds,
      getPointerTime,
      initialVisibleFraction,
      horizontalZoomInitialized,
      measuredWidth,
      chartPanels,
    ],
  );

  useEffect(() => {
    if (expandedPanelId === null) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpandedPanelId(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [expandedPanelId]);

  useEffect(
    () => () => {
      if (cursorFrame.current !== null) cancelAnimationFrame(cursorFrame.current);
    },
    [],
  );

  return (
    <div
      ref={container}
      className={
        expandedPanelId !== null
          ? 'fixed inset-2 z-[100] h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] overflow-hidden rounded-xl border border-border bg-background shadow-2xl'
          : 'relative h-full min-h-0 w-full min-w-0 overflow-hidden'
      }
      data-testid="signal-chart"
      role="group"
      aria-label={`${LABELS.chartGroupLabel}: ${panels.length} signals`}
    >
      {chartHeight > 0 &&
        chartPanels.map((panel, index) => {
          const sliderReserve = 42;
          const outerInset = 8;
          const cardGap = 14;
          const panelSlot =
            (chartHeight - sliderReserve - outerInset * 2) / Math.max(1, chartPanels.length);
          const top = outerInset + index * panelSlot;
          const height = panelSlot - cardGap;
          const visibleStart =
            domainStartSeconds +
            ((domainEndSeconds - domainStartSeconds) * visiblePercent.start) / 100;
          const visibleEnd =
            domainStartSeconds +
            ((domainEndSeconds - domainStartSeconds) * visiblePercent.end) / 100;
          const summary = getSignalSummary(
            panel.reference,
            panel.comparison,
            cursorTime,
            visibleStart,
            visibleEnd,
          );
          const summaryItems = [
            [LABELS.currentValue, summary.current],
            [LABELS.maximumValue, summary.maximum],
            [LABELS.differenceValue, summary.difference],
          ] as const;
          const expanded = expandedPanelId === panel.id;

          return (
            <Fragment key={panel.id}>
              <Card
                className="pointer-events-none absolute left-0 right-0 z-0 gap-0 rounded-xl border border-border/70 bg-card/55 p-0 shadow-sm"
                style={{ top, height }}
                aria-hidden="true"
              />
              <CardHeader
                className="pointer-events-none absolute inset-x-0 z-0 flex h-[60px] flex-col items-stretch justify-center gap-1 px-3 py-1.5 sm:px-4"
                style={{ top }}
              >
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="size-2 shrink-0 rounded-full ring-2 ring-background"
                        style={{ backgroundColor: panel.color }}
                        aria-hidden="true"
                      />
                      <CardTitle className="truncate text-sm font-semibold tracking-tight">
                        {panel.label}
                      </CardTitle>
                      <span className="shrink-0 rounded-md bg-muted/70 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {panel.unit ?? LABELS.unitUnspecified}
                      </span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="pointer-events-auto size-7 shrink-0 rounded-md"
                    aria-label={
                      expanded
                        ? `Close expanded ${panel.label} chart`
                        : `Expand ${panel.label} chart`
                    }
                    title={expanded ? 'Close expanded chart' : 'Expand chart'}
                    onClick={() =>
                      setExpandedPanelId((current) => (current === panel.id ? null : panel.id))
                    }
                  >
                    {expanded ? <X className="size-4" /> : <Maximize2 className="size-4" />}
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-3 pl-4 text-[10px] leading-tight sm:max-w-md sm:gap-6 sm:pl-5">
                  {summaryItems.map(([label, value]) => (
                    <div key={label} className="min-w-0">
                      <div className="truncate uppercase tracking-wide text-muted-foreground">
                        {label}
                      </div>
                      <div className="truncate font-mono text-xs font-medium tabular-nums text-foreground">
                        {typeof value === 'number'
                          ? `${label === LABELS.differenceValue && value > 0 ? '+' : ''}${formatChartValue(value)}`
                          : '—'}
                      </div>
                    </div>
                  ))}
                </div>
              </CardHeader>
              <CardFooter
                className="pointer-events-auto absolute z-0 flex h-6 items-center justify-end gap-3 border-0 bg-transparent px-3 py-0 sm:px-4"
                style={{ top: top + height - 24, left: 0, right: 0 }}
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-pressed={panel.referenceVisible !== false}
                  onClick={() => handleToggleSeries(panel.id, 'reference')}
                  className={`h-auto rounded-sm px-0 py-0 text-[10px] text-muted-foreground transition-opacity ${panel.referenceVisible === false ? 'opacity-40' : 'opacity-100'}`}
                  title={`${LABELS.referenceSeries}: ${panel.label}`}
                >
                  <span className="w-4 border-t border-dashed border-foreground/70" />
                  {LABELS.referenceSeries}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-pressed={panel.comparisonVisible !== false}
                  onClick={() => handleToggleSeries(panel.id, 'comparison')}
                  className={`h-auto rounded-sm px-0 py-0 text-[10px] text-muted-foreground transition-opacity ${panel.comparisonVisible === false ? 'opacity-40' : 'opacity-100'}`}
                  title={`${LABELS.comparisonSeries}: ${panel.label}`}
                >
                  <span className="w-4 border-t-2" style={{ borderColor: panel.color }} />
                  {LABELS.comparisonSeries}
                </Button>
              </CardFooter>
            </Fragment>
          );
        })}
      <div className="absolute inset-0 z-10">
        {option && (
          <ReactEChartsCore
            echarts={echarts}
            autoResize={false}
            option={option}
            notMerge={false}
            replaceMerge={['series', 'yAxis', 'xAxis', 'grid', 'title']}
            lazyUpdate
            opts={ECHARTS_OPTIONS}
            onChartReady={handleChartReady}
            onEvents={chartEvents}
            style={CHART_STYLE}
          />
        )}
      </div>
    </div>
  );
}

export const EChartsSignalChart = memo(EChartsSignalChartComponent);
