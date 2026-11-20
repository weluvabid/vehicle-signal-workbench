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
import { SignalChartCard } from './signal-chart-card';
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
          return (
            <SignalChartCard
              key={panel.id}
              panel={panel}
              top={outerInset + index * panelSlot}
              height={panelSlot - cardGap}
              domainStartSeconds={domainStartSeconds}
              domainEndSeconds={domainEndSeconds}
              visibleStartPercent={visiblePercent.start}
              visibleEndPercent={visiblePercent.end}
              cursorTime={cursorTime}
              expanded={expandedPanelId === panel.id}
              onExpand={() =>
                setExpandedPanelId((current) => (current === panel.id ? null : panel.id))
              }
              onToggleSeries={(panelId, series) =>
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
                }))
              }
            />
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
