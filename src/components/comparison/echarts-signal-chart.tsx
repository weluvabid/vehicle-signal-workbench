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
import { RotateCcw } from 'lucide-react';
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
    const chart = chartRef.current;
    if (!chart || chart.isDisposed()) return;
    const modifierCount = Number(event.metaKey) + Number(event.ctrlKey) + Number(event.shiftKey) + Number(event.altKey);
    if (modifierCount === 0) {
      // Prevent ECharts' internal wheel handler from consuming ordinary page scroll.
      event.stopImmediatePropagation();
      return;
    }
    if (modifierCount !== 1) return;
    const zoomOption = chart.getOption().dataZoom;
    const zooms = Array.isArray(zoomOption) ? zoomOption as Array<{ id?: string; start?: number; end?: number }> : [];
    const horizontal = zooms.find((item) => item.id === 'viewport-inside');
    if (!horizontal || typeof horizontal.start !== 'number' || typeof horizontal.end !== 'number') return;
    const delta = event.deltaY !== 0 ? event.deltaY : event.deltaX;
    if (!Number.isFinite(delta) || delta === 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    if (event.metaKey || event.ctrlKey) {
      const bounds = chart.getDom().getBoundingClientRect();
      const plotLeft = 56;
      const plotRight = 20;
      const anchor = Math.min(1, Math.max(0, (event.clientX - bounds.left - plotLeft) / Math.max(1, bounds.width - plotLeft - plotRight)));
      const minimumSpan = 0.1 / Math.max(0.1, domainEndSeconds - domainStartSeconds) * 100;
      const next = getWheelZoomRange({ start: horizontal.start, end: horizontal.end }, delta, anchor, minimumSpan);
      if (next) chart.dispatchAction({ type: 'dataZoom', dataZoomId: 'viewport-inside', start: next.start, end: next.end });
      return;
    }

    if (event.shiftKey) {
      const span = horizontal.end - horizontal.start;
      const shift = delta * 0.04;
      const start = Math.min(100 - span, Math.max(0, horizontal.start + shift));
      chart.dispatchAction({ type: 'dataZoom', dataZoomId: 'viewport-inside', start, end: start + span });
      return;
    }

    if (event.altKey) {
      const bounds = chart.getDom().getBoundingClientRect();
      const sliderReserve = 50;
      const panelSlot = (bounds.height - sliderReserve - 16) / Math.max(1, panels.length);
      const index = Math.max(0, Math.min(panels.length - 1, Math.floor((event.clientY - bounds.top - 8) / panelSlot)));
      const id = `signal-y-inside-${index}`;
      const current = zooms.find((item) => item.id === id);
      const start = current?.start ?? 0;
      const end = current?.end ?? 100;
      const span = end - start;
      const nextSpan = Math.max(2, Math.min(100, span * Math.exp(delta * 0.002)));
      const center = (start + end) / 2;
      const nextStart = Math.max(0, Math.min(100 - nextSpan, center - nextSpan / 2));
      chart.dispatchAction({ type: 'dataZoom', dataZoomId: id, start: nextStart, end: nextStart + nextSpan });
    }
  }, [domainEndSeconds, domainStartSeconds, panels.length]);

  const resetAllZoom = useCallback(() => {
    const chart = chartRef.current;
    if (!chart || chart.isDisposed()) return;
    chart.dispatchAction({ type: 'dataZoom', dataZoomId: 'viewport-inside', start: 0, end: 100 });
    panels.forEach((_, index) => chart.dispatchAction({
      type: 'dataZoom', dataZoomId: `signal-y-inside-${index}`, start: 0, end: 100,
    }));
  }, [panels]);

  useEffect(() => () => {
    if (wheelTargetRef.current && wheelHandlerRef.current) {
      wheelTargetRef.current.removeEventListener('wheel', wheelHandlerRef.current, true);
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
      <button type="button" onClick={resetAllZoom} aria-label="Reset all chart zoom" title="Reset zoom" className="absolute right-3 top-2 z-30 grid size-8 place-items-center rounded-full border border-border/70 bg-background/90 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:bg-muted hover:text-foreground">
        <RotateCcw className="size-3.5" aria-hidden="true" />
      </button>
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
              wheelTargetRef.current.removeEventListener('wheel', wheelHandlerRef.current, true);
            }
            chartRef.current = chart;
            const target = chart.getDom();
            const handler = (event: WheelEvent) => handleCommandWheel(event);
            target.addEventListener('wheel', handler, { passive: false, capture: true });
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
