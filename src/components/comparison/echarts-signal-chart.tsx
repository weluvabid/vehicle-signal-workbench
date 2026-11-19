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
import { useCallback, useMemo, useRef, useState } from 'react';
import type { SignalChartPanel } from './signal-chart-types';
import { createSignalChartOption } from './echarts-options';
import { useEChartsSignalChart } from '@/features/comparison/chart/use-echarts-signal-chart';
import { useChartInteractions } from '@/features/comparison/chart/use-chart-interactions';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { COMPARISON_LABELS as LABELS } from '@/constants/comparison-labels';

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

  const { attachChart } = useChartInteractions({
    domainStartSeconds,
    domainEndSeconds,
    panelCount: panels.length,
  });

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
                {panel.unit ?? LABELS.unitUnspecified}
              </span>
            </div>
            <div className="pointer-events-auto flex shrink-0 items-center gap-2 sm:gap-3 text-[10px] text-muted-foreground" aria-label={`${panel.label} series visibility`}>
              <Button
                type="button" variant="ghost" size="sm"
                aria-pressed={panel.referenceVisible !== false}
                onClick={() => setSeriesVisibility((current) => ({ ...current, [panel.id]: { reference: !(current[panel.id]?.reference ?? true), comparison: current[panel.id]?.comparison ?? true } }))}
                className={`h-auto rounded-sm px-0 py-0 text-[10px] transition-opacity ${panel.referenceVisible === false ? 'opacity-40' : 'opacity-100'}`}
                title={`${LABELS.referenceSeries}: ${panel.label}`}
              >
                <span className="w-4 border-t border-dashed border-foreground/70" />{LABELS.referenceSeries}
              </Button>
              <Button
                type="button" variant="ghost" size="sm"
                aria-pressed={panel.comparisonVisible !== false}
                onClick={() => setSeriesVisibility((current) => ({ ...current, [panel.id]: { reference: current[panel.id]?.reference ?? true, comparison: !(current[panel.id]?.comparison ?? true) } }))}
                className={`h-auto rounded-sm px-0 py-0 text-[10px] transition-opacity ${panel.comparisonVisible === false ? 'opacity-40' : 'opacity-100'}`}
                title={`${LABELS.comparisonSeries}: ${panel.label}`}
              >
                <span className="w-4 border-t-2" style={{ borderColor: panel.color }} />{LABELS.comparisonSeries}
              </Button>
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
            attachChart(chart);
            requestInitialViewport(chart);
          }}
          onEvents={{ datazoom: handleDataZoom, updateAxisPointer: handleAxisPointer, globalout: clearPointerTime }}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  );
}
