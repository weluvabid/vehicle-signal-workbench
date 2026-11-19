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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SignalChartPanel } from './signal-chart-types';
import { createSignalChartOption } from './echarts-options';
import { getWheelZoomRange } from './chart-wheel-zoom';
import { useEChartsSignalChart } from '@/features/comparison/chart/use-echarts-signal-chart';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';

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


export function EChartsSignalChart({
  panels,
  domainStartSeconds,
  domainEndSeconds,
  initialVisibleFraction,
  onViewportChange,
  onMetricsViewportChange,
}: EChartsSignalChartProps) {
  const pointerTime = useRef<number | null>(null);
  const chartRef = useRef<echarts.EChartsType | null>(null);
  const wheelTargetRef = useRef<HTMLElement | null>(null);
  const wheelHandlerRef = useRef<((event: WheelEvent) => void) | null>(null);
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
  }, []);
  const clearPointerTime = useCallback(() => { pointerTime.current = null; }, []);

  const handleCommandWheel = useCallback((event: WheelEvent) => {
    // ECharts supports Ctrl/Shift/Alt modifiers, but not macOS Command. Handle
    // Command+wheel here and leave all unmodified wheel events to the document.
    if (!event.metaKey || event.shiftKey || event.altKey || event.ctrlKey) return;
    const chart = chartRef.current;
    if (!chart || chart.isDisposed()) return;

    const zoomOption = chart.getOption().dataZoom;
    const insideZoom = (Array.isArray(zoomOption) ? zoomOption : []).find(
      (item) => item && typeof item === 'object' && (item as { id?: string }).id === 'viewport-inside',
    ) as { start?: number; end?: number } | undefined;
    const start = insideZoom?.start;
    const end = insideZoom?.end;
    if (typeof start !== 'number' || typeof end !== 'number' || end <= start) return;

    const bounds = chart.getDom().getBoundingClientRect();
    const plotLeft = 56;
    const plotRight = 20;
    const plotWidth = Math.max(1, bounds.width - plotLeft - plotRight);
    const anchor = (event.clientX - bounds.left - plotLeft) / plotWidth;
    const delta = event.deltaY !== 0 ? event.deltaY : event.deltaX;
    const minimumSpan = 0.1 / Math.max(0.1, domainEndSeconds - domainStartSeconds) * 100;
    const next = getWheelZoomRange({ start, end }, delta, anchor, minimumSpan);
    if (!next) return;

    event.preventDefault();
    chart.dispatchAction({
      type: 'dataZoom',
      dataZoomId: 'viewport-inside',
      start: next.start,
      end: next.end,
    });
  }, [domainEndSeconds, domainStartSeconds]);

  useEffect(() => () => {
    if (wheelTargetRef.current && wheelHandlerRef.current) {
      wheelTargetRef.current.removeEventListener('wheel', wheelHandlerRef.current);
    }
    chartRef.current = null;
  }, []);

  const {
    container, chartHeight, measuredWidth,
    requestInitialViewport, handleDataZoom,
  } = useEChartsSignalChart({
    domainStartSeconds,
    domainEndSeconds,
    initialVisibleFraction,
    onViewportChange,
    onMetricsViewportChange,
      hasPanels: panels.length > 0,
  });

  const option = useMemo(
    () => createSignalChartOption(visiblePanels, domainStartSeconds, domainEndSeconds, chartHeight || 600, measuredWidth || 1024, initialVisibleFraction, getPointerTime),
    [chartHeight, domainEndSeconds, domainStartSeconds, initialVisibleFraction, measuredWidth, visiblePanels, getPointerTime],
  );

  return (
    <div
      ref={container}
      className="echarts-signal-chart relative h-full min-h-0"
      data-testid="signal-chart"
      role="group"
      aria-label={`Synchronized comparison of ${panels.length} signals. Command/Ctrl plus wheel zooms time, Shift plus wheel pans time, drag pans time, and Alt plus wheel zooms the individual signal scale.`}
    >
      {chartHeight > 0 && visiblePanels.map((panel, index) => {
        const sliderReserve = 42;
        const outerInset = 8;
        const cardGap = 14;
        const panelSlot = (chartHeight - sliderReserve - outerInset * 2) / Math.max(1, panels.length);
        return (
          <Card
            key={panel.id}
            className="pointer-events-none absolute left-0 right-0 z-0 rounded-xl border border-border/70 bg-card/55 shadow-sm"
            style={{ top: `${outerInset + index * panelSlot}px`, height: `${panelSlot - cardGap}px` }}
            aria-label={`${panel.label} signal chart`}
          />
        );
      })}
      {chartHeight > 0 && visiblePanels.map((panel, index) => {
        const sliderReserve = 42;
        const outerInset = 8;
        const panelSlot = (chartHeight - sliderReserve - outerInset * 2) / Math.max(1, panels.length);
        return (
          <CardHeader
            key={`${panel.id}-header`}
            className="pointer-events-none absolute inset-x-0 z-20 flex h-[38px] flex-row items-center justify-between gap-2 px-3 py-0 sm:h-[42px] sm:gap-3 sm:px-4"
            style={{ top: `${outerInset + index * panelSlot}px` }}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-full ring-2 ring-background" style={{ backgroundColor: panel.color }} aria-hidden="true" />
              <CardTitle className="truncate text-sm font-semibold tracking-tight">{panel.label}</CardTitle>
              <span className="shrink-0 rounded-md bg-muted/70 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {panel.unit ?? 'Unit unspecified'}
              </span>
            </div>
            <div className="pointer-events-auto flex shrink-0 items-center gap-2 sm:gap-3 text-[10px] text-muted-foreground" aria-label={`${panel.label} series visibility`}>
              <button
                type="button"
                aria-pressed={panel.referenceVisible !== false}
                onClick={() => setSeriesVisibility((current) => ({ ...current, [panel.id]: { reference: !(current[panel.id]?.reference ?? true), comparison: current[panel.id]?.comparison ?? true } }))}
                className={`flex items-center gap-1.5 rounded-sm outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-ring ${panel.referenceVisible === false ? 'opacity-40' : 'opacity-100'}`}
                title={`Toggle ${panel.label} reference series`}
              >
                <span className="w-4 border-t border-dashed border-foreground/70" />Reference
              </button>
              <button
                type="button"
                aria-pressed={panel.comparisonVisible !== false}
                onClick={() => setSeriesVisibility((current) => ({ ...current, [panel.id]: { reference: current[panel.id]?.reference ?? true, comparison: !(current[panel.id]?.comparison ?? true) } }))}
                className={`flex items-center gap-1.5 rounded-sm outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-ring ${panel.comparisonVisible === false ? 'opacity-40' : 'opacity-100'}`}
                title={`Toggle ${panel.label} comparison series`}
              >
                <span className="w-4 border-t-2" style={{ borderColor: panel.color }} />Comparison
              </button>
            </div>
          </CardHeader>
        );
      })}
      <div className="absolute inset-0 z-10">
        <ReactEChartsCore
          echarts={echarts}
          option={option}
          notMerge={false}
          replaceMerge={['series', 'yAxis', 'xAxis', 'grid', 'title']}
          lazyUpdate
          opts={{ renderer: 'canvas' }}
          onChartReady={(chart) => {
            if (wheelTargetRef.current && wheelHandlerRef.current) {
              wheelTargetRef.current.removeEventListener('wheel', wheelHandlerRef.current);
            }
            chartRef.current = chart;
            const target = chart.getDom();
            const handler = (event: WheelEvent) => handleCommandWheel(event);
            target.addEventListener('wheel', handler, { passive: false });
            wheelTargetRef.current = target;
            wheelHandlerRef.current = handler;
            requestInitialViewport(chart);
          }}
          onEvents={{ datazoom: handleDataZoom, updateAxisPointer: handleAxisPointer, globalout: clearPointerTime }}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  );
}
