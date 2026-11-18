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
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { SignalChartPanel } from './signal-chart-types';
import { createSignalChartOption } from './echarts-options';
import { parseFiniteChartNumber } from './chart-viewport';

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

  useEffect(() => {
    latestProps.current = { domainStartSeconds, domainEndSeconds, onViewportChange };
  }, [domainStartSeconds, domainEndSeconds, onViewportChange]);

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
    const startValue = parseFiniteChartNumber(event.startValue);
    const endValue = parseFiniteChartNumber(event.endValue);
    const startPercent = parseFiniteChartNumber(event.start);
    const endPercent = parseFiniteChartNumber(event.end);
    const start = startValue ?? (startPercent === null ? null : domainStart + duration * startPercent / 100);
    const end = endValue ?? (endPercent === null ? null : domainStart + duration * endPercent / 100);

    if (start === null || end === null || end <= start) return;
    dispatchViewport({
      startSeconds: Math.max(domainStart, start),
      endSeconds: Math.min(domainEnd, end),
      pixelWidth: chartWidth.current,
    });
  }, [dispatchViewport]);

  const option = useMemo(
    () => createSignalChartOption(panels, domainStartSeconds, domainEndSeconds),
    [domainEndSeconds, domainStartSeconds, panels],
  );

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
