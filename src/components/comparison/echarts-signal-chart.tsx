'use client';

import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import type { EChartsOption } from 'echarts';
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
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { SignalPoint } from '@/features/measurements/plot-data';

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

export interface SignalChartPanel {
  readonly id: string;
  readonly label: string;
  readonly unit: string | null;
  readonly reference: readonly SignalPoint[];
  readonly comparison: readonly SignalPoint[];
  readonly delta: readonly SignalPoint[];
}

interface EChartsSignalChartProps {
  readonly panels: readonly SignalChartPanel[];
  readonly domainStartSeconds: number;
  readonly domainEndSeconds: number;
  readonly onViewportChange: (startSeconds: number, endSeconds: number, pixelWidth: number) => void;
}

interface DataZoomEvent {
  readonly start?: number;
  readonly end?: number;
  readonly startValue?: number;
  readonly endValue?: number;
  readonly batch?: readonly DataZoomEvent[];
}

interface PendingViewport {
  readonly startSeconds: number;
  readonly endSeconds: number;
  readonly pixelWidth: number;
}

const numberFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 });

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function EChartsSignalChart({
  panels,
  domainStartSeconds,
  domainEndSeconds,
  onViewportChange,
}: EChartsSignalChartProps) {
  const container = useRef<HTMLDivElement>(null);
  const pendingViewport = useRef<PendingViewport | null>(null);
  const lastViewport = useRef<PendingViewport | null>(null);
  const animationFrame = useRef<number | null>(null);
  const chartWidth = useRef(1);
  const latestProps = useRef({ domainStartSeconds, domainEndSeconds, onViewportChange });
  latestProps.current = { domainStartSeconds, domainEndSeconds, onViewportChange };

  const dispatchViewport = useCallback((viewport: PendingViewport) => {
    lastViewport.current = viewport;
    pendingViewport.current = viewport;
    if (animationFrame.current !== null) return;

    animationFrame.current = requestAnimationFrame(() => {
      animationFrame.current = null;
      const pending = pendingViewport.current;
      pendingViewport.current = null;
      if (pending) latestProps.current.onViewportChange(
        pending.startSeconds,
        pending.endSeconds,
        pending.pixelWidth,
      );
    });
  }, []);

  // The chart can become ready before the workspace has selected its default
  // channels. In that case the first viewport callback is intentionally ignored
  // by the data owner (there are no selections yet). Re-dispatch when panels
  // become available so the initial worker query is not lost.
  useEffect(() => {
    if (panels.length === 0) return;
    dispatchViewport({
      startSeconds: domainStartSeconds,
      endSeconds: domainEndSeconds,
      pixelWidth: chartWidth.current,
    });
  }, [panels.length, domainStartSeconds, domainEndSeconds, dispatchViewport]);

  useEffect(() => {
    const element = container.current;
    if (!element || typeof ResizeObserver === 'undefined') return;

    let previousWidth = 0;
    const observer = new ResizeObserver((entries) => {
      const width = Math.floor(entries[0]?.contentRect.width ?? 0);
      if (width < 1 || Math.abs(width - previousWidth) < 24) return;
      previousWidth = width;
      chartWidth.current = width;
      const viewport = lastViewport.current;
      if (viewport) dispatchViewport({ ...viewport, pixelWidth: width });
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [dispatchViewport]);

  useEffect(() => () => {
    if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
  }, []);

  const requestInitialViewport = useCallback((chart: { getWidth: () => number }) => {
    chartWidth.current = Math.max(1, Math.floor(chart.getWidth()));
    dispatchViewport({
      startSeconds: latestProps.current.domainStartSeconds,
      endSeconds: latestProps.current.domainEndSeconds,
      pixelWidth: chartWidth.current,
    });
  }, [dispatchViewport]);

  const handleDataZoom = useCallback((rawEvent: DataZoomEvent) => {
    const event = rawEvent.batch?.at(-1) ?? rawEvent;
    const domainStart = latestProps.current.domainStartSeconds;
    const domainEnd = latestProps.current.domainEndSeconds;
    const duration = domainEnd - domainStart;
    const startValue = finiteNumber(event.startValue);
    const endValue = finiteNumber(event.endValue);
    const startPercent = finiteNumber(event.start);
    const endPercent = finiteNumber(event.end);
    const start = startValue ?? (startPercent === null ? null : domainStart + duration * startPercent / 100);
    const end = endValue ?? (endPercent === null ? null : domainStart + duration * endPercent / 100);

    if (start === null || end === null || end <= start) return;
    dispatchViewport({
      startSeconds: Math.max(domainStart, start),
      endSeconds: Math.min(domainEnd, end),
      pixelWidth: chartWidth.current,
    });
  }, [dispatchViewport]);

  const option = useMemo<EChartsOption>(() => {
    const panelGap = 330;
    const panelCount = panels.length * 2;
    const grids = Array.from({ length: panelCount }, (_, index) => ({
      top: 38 + Math.floor(index / 2) * 330 + (index % 2) * 164,
      left: 76,
      right: 28,
      height: 112,
      containLabel: true,
    }));
    const xAxes = Array.from({ length: panelCount }, (_, index) => ({
      type: 'value' as const,
      gridIndex: index,
      min: domainStartSeconds,
      max: domainEndSeconds,
      name: index === panelCount - 1 ? 'Elapsed time (s)' : '',
      nameLocation: 'middle' as const,
      nameGap: 31,
      axisLine: { lineStyle: { color: '#454b55' } },
      axisTick: { lineStyle: { color: '#454b55' } },
      axisLabel: { color: '#858b95', hideOverlap: true },
      splitLine: { lineStyle: { color: '#25292f', type: 'dashed' as const } },
      nameTextStyle: { color: '#858b95', fontSize: 10 },
    }));
    const yAxes = Array.from({ length: panelCount }, (_, index) => {
      const panel = panels[Math.floor(index / 2)];
      return {
      type: 'value' as const,
      gridIndex: index,
      name: index % 2 === 0 ? (panel.unit ?? 'Value') : `Δ ${panel.unit ?? 'Value'}`,
      nameLocation: 'middle' as const,
      nameGap: 52,
      scale: true,
      axisLine: { show: true, lineStyle: { color: '#454b55' } },
      axisTick: { lineStyle: { color: '#454b55' } },
      axisLabel: { color: '#858b95', hideOverlap: true },
      splitLine: { lineStyle: { color: '#25292f', type: 'dashed' as const } },
      nameTextStyle: { color: '#858b95', fontSize: 10 },
    };
    });
    const series = panels.flatMap((panel, index) => ([
      {
        id: `${panel.id}-reference`,
        name: `${panel.label} · Reference`,
        type: 'line' as const,
        xAxisIndex: index * 2,
        yAxisIndex: index * 2,
        data: panel.reference.slice(),
        showSymbol: false,
        connectNulls: false,
        smooth: false,
        lineStyle: { color: '#e5e7eb', width: 1.4 },
        emphasis: { focus: 'series' as const, lineStyle: { width: 2 } },
      },
      {
        id: `${panel.id}-comparison`,
        name: `${panel.label} · Comparison`,
        type: 'line' as const,
        xAxisIndex: index * 2,
        yAxisIndex: index * 2,
        data: panel.comparison.slice(),
        showSymbol: false,
        connectNulls: false,
        smooth: false,
        lineStyle: { color: '#929ba8', width: 1.4, type: 'dashed' as const },
        emphasis: { focus: 'series' as const, lineStyle: { width: 2 } },
      },
      {
        id: `${panel.id}-delta`,
        name: `${panel.label} · Δ (Reference − Comparison)`,
        type: 'line' as const,
        xAxisIndex: index * 2 + 1,
        yAxisIndex: index * 2 + 1,
        data: panel.delta.slice(),
        showSymbol: false,
        connectNulls: false,
        smooth: false,
        lineStyle: { color: '#d6a85f', width: 1.35 },
        emphasis: { focus: 'series' as const, lineStyle: { width: 2 } },
      },
    ]));
    const axisIndexes = Array.from({ length: panelCount }, (_, index) => index);

    return {
      animation: false,
      backgroundColor: 'transparent',
      textStyle: {
        color: '#aeb4be',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 10,
      },
      grid: grids,
      title: panels.flatMap((panel, index) => ([
        { text: panel.label, subtext: panel.unit ?? 'Unit unspecified', left: 76, top: 5 + index * panelGap, itemGap: 2, textStyle: { color: '#d2d5da', fontSize: 11, fontWeight: 500 }, subtextStyle: { color: '#858b95', fontSize: 9 } },
        { text: 'Difference · Reference − Comparison', subtext: 'Interpolated on reference timestamps', left: 76, top: 169 + index * panelGap, itemGap: 2, textStyle: { color: '#d6a85f', fontSize: 10, fontWeight: 500 }, subtextStyle: { color: '#858b95', fontSize: 9 } },
      ])),
      legend: {
        top: 7,
        right: 16,
        type: 'scroll',
        itemWidth: 16,
        itemHeight: 2,
        textStyle: { color: '#b6bbc3', fontSize: 10 },
        data: series.map((item) => item.name),
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross', snap: false },
        backgroundColor: '#171a1f',
        borderColor: '#454b55',
        textStyle: { color: '#f1f2f3', fontSize: 10 },
        valueFormatter: (value) => value == null
          ? 'Missing'
          : numberFormatter.format(Number(value)),
      },
      xAxis: xAxes,
      yAxis: yAxes,
      axisPointer: {
        link: [{ xAxisIndex: 'all' }],
        label: { backgroundColor: '#454b55' },
      },
      dataZoom: [
        {
          id: 'viewport-inside',
          type: 'inside',
          xAxisIndex: axisIndexes,
          filterMode: 'none',
          zoomOnMouseWheel: true,
          moveOnMouseMove: true,
          moveOnMouseWheel: false,
          preventDefaultMouseMove: true,
          throttle: 80,
        },
        {
          id: 'viewport-slider',
          type: 'slider',
          xAxisIndex: axisIndexes,
          height: 18,
          bottom: 12,
          borderColor: '#30343b',
          backgroundColor: '#171a1f',
          fillerColor: 'rgba(174, 180, 190, 0.16)',
          handleStyle: { color: '#aeb4be', borderColor: '#d7dbe1' },
          textStyle: { color: '#858b95' },
          showDataShadow: false,
          showDetail: false,
          throttle: 80,
        },
      ],
      series,
      aria: { enabled: true },
    };
  }, [domainEndSeconds, domainStartSeconds, panels]);

  const chartHeight = Math.max(520, panels.length * 330 + 100);

  return (
    <div
      ref={container}
      className="echarts-signal-chart"
      data-testid="signal-chart"
      role="group"
      aria-label={`Synchronized comparison of ${panels.length} signals. Use the mouse wheel or pinch to zoom, drag to pan, and the shared range slider to navigate all timelines.`}
    >
      <ReactEChartsCore
        echarts={echarts}
        option={option}
        notMerge={false}
        lazyUpdate
        opts={{ renderer: 'canvas' }}
        onChartReady={requestInitialViewport}
        onEvents={{ datazoom: handleDataZoom }}
        style={{ width: '100%', height: chartHeight }}
      />
    </div>
  );
}
