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
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SignalChartPanel } from './signal-chart-types';
import { createSignalChartOption } from './echarts-options';
import { useEChartsSignalChart } from '@/features/comparison/chart/use-echarts-signal-chart';
import { useChartInteractions } from '@/features/comparison/chart/use-chart-interactions';
import { SignalChartCard } from './signal-chart-card';
import { COMPARISON_LABELS as LABELS } from '@/constants/comparison-labels';
import { CHART_INTENTS } from '@/intents/chart-intents';

const ECHARTS_OPTIONS = { renderer: 'canvas' as const };
const CHART_STYLE = { width: '100%', height: '100%' };

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
  readonly onMetricsViewportChange: (startSeconds: number, endSeconds: number, isInitial: boolean) => void;
}


function EChartsSignalChartComponent({
  panels,
  domainStartSeconds,
  domainEndSeconds,
  initialVisibleFraction,
  onViewportChange,
  onMetricsViewportChange,
}: EChartsSignalChartProps) {
  const pointerTime = useRef<number | null>(null);
  const [cursorTime, setCursorTime] = useState<number | null>(null);
  const [visiblePercent, setVisiblePercent] = useState({ start: 0, end: 100 });
  const cursorFrame = useRef<number | null>(null);
  const [seriesVisibility, setSeriesVisibility] = useState<Record<string, { reference: boolean; comparison: boolean }>>({});
  const visiblePanels = useMemo(() => panels.map((panel) => ({
    ...panel,
    referenceVisible: seriesVisibility[panel.id]?.reference ?? true,
    comparisonVisible: seriesVisibility[panel.id]?.comparison ?? true,
  })), [panels, seriesVisibility]);
  const getPointerTime = useCallback(() => pointerTime.current, []);
  const handleAxisPointer = useCallback((event: unknown) => {
    if (!event || typeof event !== 'object') return;
    const axesInfo = (event as { axesInfo?: Array<{ axisDim?: string; value?: string | number }> }).axesInfo;
    const value = axesInfo?.find((axis) => axis.axisDim === 'x')?.value ?? axesInfo?.[0]?.value;
    const time = Number(value);
    pointerTime.current = value !== undefined && Number.isFinite(time) ? time : null;
    if (cursorFrame.current === null) cursorFrame.current = requestAnimationFrame(() => { cursorFrame.current = null; setCursorTime(pointerTime.current); });
  }, []);
  const clearPointerTime = useCallback(() => { pointerTime.current = null; if (cursorFrame.current === null) cursorFrame.current = requestAnimationFrame(() => { cursorFrame.current = null; setCursorTime(null); }); }, []);

  const { attachChart } = useChartInteractions({
    domainStartSeconds,
    domainEndSeconds,
    panelCount: panels.length,
  });

  const {
    container, chartHeight, measuredWidth,
    registerChart, requestInitialViewport, handleDataZoom,
  } = useEChartsSignalChart({
    domainStartSeconds,
    domainEndSeconds,
    initialVisibleFraction,
    onViewportChange,
    onMetricsViewportChange,
      hasPanels: panels.length > 0,
  });

  const handleDataZoomWithSummary = useCallback((event: unknown) => {
    if (event && typeof event === 'object') {
      const candidate = event as { start?: number; end?: number; batch?: Array<{ start?: number; end?: number; dataZoomId?: string }> };
      const range = candidate.batch?.find((item) => item.dataZoomId === 'viewport-inside' || item.dataZoomId === 'viewport-slider') ?? candidate;
      if (typeof range.start === 'number' && typeof range.end === 'number') {
        setVisiblePercent({ start: range.start, end: range.end });
        window.dispatchEvent(new CustomEvent(CHART_INTENTS.HORIZONTAL_ZOOM_CHANGED, { detail: { factor: Math.min(20, 100 / Math.max(5, range.end - range.start)) } }));
      }
    }
    handleDataZoom(event as Parameters<typeof handleDataZoom>[0]);
  }, [handleDataZoom]);

  const chartEvents = useMemo(
    () => ({ datazoom: handleDataZoomWithSummary, updateAxisPointer: handleAxisPointer, globalout: clearPointerTime }),
    [handleDataZoomWithSummary, handleAxisPointer, clearPointerTime],
  );

  const handleChartReady = useCallback((chart: echarts.EChartsType) => {
    registerChart(chart);
    attachChart(chart);
    requestInitialViewport(chart);
  }, [attachChart, registerChart, requestInitialViewport]);

  const option = useMemo(
    () => measuredWidth > 0 && chartHeight > 0
      ? createSignalChartOption(visiblePanels, domainStartSeconds, domainEndSeconds, chartHeight, measuredWidth, initialVisibleFraction, getPointerTime)
      : null,
    [chartHeight, domainEndSeconds, domainStartSeconds, initialVisibleFraction, measuredWidth, visiblePanels, getPointerTime],
  );

  useEffect(() => () => { if (cursorFrame.current !== null) cancelAnimationFrame(cursorFrame.current); }, []);

  return (
    <div
      ref={container}
      className="relative h-full min-h-0 w-full min-w-0 overflow-hidden"
      data-testid="signal-chart"
      role="group"
      aria-label={`${LABELS.chartGroupLabel}: ${panels.length} signals`}
    >
      {chartHeight > 0 && visiblePanels.map((panel, index) => {
        const sliderReserve = 42;
        const outerInset = 8;
        const cardGap = 14;
        const panelSlot = (chartHeight - sliderReserve - outerInset * 2) / Math.max(1, panels.length);
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
            onToggleSeries={(panelId, series) => setSeriesVisibility((current) => ({
              ...current,
              [panelId]: {
                reference: series === 'reference' ? !(current[panelId]?.reference ?? true) : current[panelId]?.reference ?? true,
                comparison: series === 'comparison' ? !(current[panelId]?.comparison ?? true) : current[panelId]?.comparison ?? true,
              },
            }))}
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
