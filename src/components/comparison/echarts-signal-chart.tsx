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
  readonly onFpsChange: (fps: number) => void;
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
  onFpsChange,
}: EChartsSignalChartProps) {
  const container = useRef<HTMLDivElement>(null);
  const pendingViewport = useRef<PendingViewport | null>(null);
  const lastViewport = useRef<PendingViewport | null>(null);
  const animationFrame = useRef<number | null>(null);
  const chartWidth = useRef(1);
  const fpsFrame = useRef<number | null>(null);
  const fpsLastInteraction = useRef(0);
  const fpsWindowStart = useRef(0);
  const fpsFrames = useRef(0);
  const pointerActive = useRef(false);
  const [chartHeight, setChartHeight] = useState(0);
  const latestProps = useRef({ domainStartSeconds, domainEndSeconds, onViewportChange });

  useEffect(() => {
    latestProps.current = { domainStartSeconds, domainEndSeconds, onViewportChange };
  }, [domainStartSeconds, domainEndSeconds, onViewportChange]);

  const recordInteraction = useCallback(() => {
    fpsLastInteraction.current = performance.now();
    if (fpsFrame.current !== null) return;
    fpsWindowStart.current = 0;
    fpsFrames.current = 0;
    const tick = (now: number) => {
      if (fpsWindowStart.current === 0) fpsWindowStart.current = now;
      fpsFrames.current += 1;
      const elapsed = now - fpsWindowStart.current;
      if (elapsed >= 250) {
        onFpsChange(Math.round(((fpsFrames.current - 1) * 1000) / elapsed));
        fpsWindowStart.current = now;
        fpsFrames.current = 1;
      }
      if (now - fpsLastInteraction.current < 900) {
        fpsFrame.current = requestAnimationFrame(tick);
      } else {
        // Publish short gestures too; otherwise a quick wheel/pinch zoom can
        // finish before the first reporting window and leave the metric stale.
        const finalElapsed = now - fpsWindowStart.current;
        if (finalElapsed >= 100 && fpsFrames.current > 1) {
          onFpsChange(Math.round(((fpsFrames.current - 1) * 1000) / finalElapsed));
        }
        fpsFrame.current = null;
      }
    };
    fpsFrame.current = requestAnimationFrame(tick);
  }, [onFpsChange]);

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
      const entry = entries[0];
      const width = Math.floor(entry?.contentRect.width ?? 0);
      const height = Math.floor(entry?.contentRect.height ?? 0);
      if (width > 0 && Math.abs(width - previousWidth) >= 24) {
        previousWidth = width;
        chartWidth.current = width;
        const viewport = lastViewport.current;
        if (viewport) dispatchViewport({ ...viewport, pixelWidth: width });
      }
      if (height > 0) setChartHeight((current) => current === height ? current : height);
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [dispatchViewport]);

  useEffect(() => () => {
    if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
    if (fpsFrame.current !== null) cancelAnimationFrame(fpsFrame.current);
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
    // ECharts emits datazoom for inside-wheel, drag-pan, pinch and slider
    // interactions. Use this as the authoritative interaction signal rather
    // than relying only on DOM pointer movement over the wrapper.
    recordInteraction();
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
    const boundedStart = Math.max(domainStart, start);
    const boundedEnd = Math.min(domainEnd, end);
    dispatchViewport({
      startSeconds: boundedStart,
      endSeconds: boundedEnd,
      pixelWidth: chartWidth.current,
    });
  }, [dispatchViewport, recordInteraction]);

  const option = useMemo(
    () => createSignalChartOption(panels, domainStartSeconds, domainEndSeconds, chartHeight || 600),
    [chartHeight, domainEndSeconds, domainStartSeconds, panels],
  );

  return (
    <div
      ref={container}
      className="echarts-signal-chart relative h-full min-h-0"
      data-testid="signal-chart"
      role="group"
      onPointerDown={() => { pointerActive.current = true; recordInteraction(); }}
      onPointerMove={() => { if (pointerActive.current) recordInteraction(); }}
      onPointerUp={() => { pointerActive.current = false; }}
      onPointerCancel={() => { pointerActive.current = false; }}
      onWheel={recordInteraction}
      onTouchMove={recordInteraction}
      aria-label={`Synchronized comparison of ${panels.length} signals. Use the mouse wheel or pinch to zoom, drag to pan, and the shared range slider to navigate all timelines.`}
    >
      {chartHeight > 0 && panels.map((panel, index) => {
        const sliderReserve = 42;
        const panelSlot = Math.max(120, (chartHeight - sliderReserve - 12) / Math.max(1, panels.length));
        return (
          <div
            key={panel.id}
            className="absolute left-[76px] z-20 flex h-7 max-w-[calc(100%-110px)] items-center gap-2 rounded-sm bg-background/90 pr-2"
            style={{ top: `${8 + index * panelSlot}px` }}
          >
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: panel.color }} aria-hidden="true" />
            <span className="truncate font-mono text-xs font-semibold">{panel.label}</span>
            <span className="shrink-0 text-[10px] text-muted-foreground">{panel.unit ?? 'Unit unspecified'}</span>
          </div>
        );
      })}
      <ReactEChartsCore
        echarts={echarts}
        option={option}
        notMerge={false}
        replaceMerge={['series', 'yAxis', 'xAxis', 'grid', 'title']}
        lazyUpdate
        opts={{ renderer: 'canvas' }}
        onChartReady={(chart) => {
          requestInitialViewport(chart);
        }}
        onEvents={{ datazoom: handleDataZoom }}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}
