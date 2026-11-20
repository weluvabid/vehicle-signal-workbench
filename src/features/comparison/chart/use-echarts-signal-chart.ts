'use client';

import { CHART_DATA_ZOOM_IDS } from '@/intents/chart-intents';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { resolveDataZoomViewport, type DataZoomRangeEvent } from './viewport';
import { getInitialViewport } from '@/features/comparison/initial-viewport';

interface ResizableChart {
  resize: (options?: { width?: number; height?: number; silent?: boolean }) => void;
  getWidth: () => number;
  getHeight: () => number;
  isDisposed: () => boolean;
}

interface ObservedSize {
  readonly width: number;
  readonly height: number;
}

interface PendingViewport {
  readonly startSeconds: number;
  readonly endSeconds: number;
  readonly pixelWidth: number;
}

interface ChartControllerOptions {
  readonly domainStartSeconds: number;
  readonly domainEndSeconds: number;
  readonly initialVisibleFraction: number;
  readonly onViewportChange: (startSeconds: number, endSeconds: number, pixelWidth: number) => void;
  readonly onMetricsViewportChange: (startSeconds: number, endSeconds: number, isInitial: boolean) => void;
  readonly hasPanels: boolean;
}

/** Owns chart viewport dispatch and resize lifecycles. */
export function useEChartsSignalChart(options: ChartControllerOptions) {
  const container = useRef<HTMLDivElement>(null);
  const pendingViewport = useRef<PendingViewport | null>(null);
  const lastViewport = useRef<PendingViewport | null>(null);
  const animationFrame = useRef<number | null>(null);
  const resizeFrame = useRef<number | null>(null);
  const chartInstance = useRef<ResizableChart | null>(null);
  const chartWidth = useRef(1);
  const [measuredSize, setMeasuredSize] = useState<ObservedSize>({ width: 0, height: 0 });
  const { width: measuredWidth, height: chartHeight } = measuredSize;
  const latestProps = useRef(options);

  useEffect(() => { latestProps.current = options; }, [options]);

  const dispatchViewport = useCallback((viewport: PendingViewport) => {
    lastViewport.current = viewport;
    pendingViewport.current = viewport;
    if (animationFrame.current !== null) return;
    animationFrame.current = requestAnimationFrame(() => {
      animationFrame.current = null;
      const pending = pendingViewport.current;
      pendingViewport.current = null;
      if (pending) latestProps.current.onViewportChange(
        pending.startSeconds, pending.endSeconds, pending.pixelWidth,
      );
    });
  }, []);

  // Resize after React has committed the matching geometry-derived option.
  // Keeping measurement in one state value prevents width/height from producing
  // separate intermediate chart configurations.
  const resizeChartToContainer = useCallback(() => {
    if (resizeFrame.current !== null) cancelAnimationFrame(resizeFrame.current);
    resizeFrame.current = requestAnimationFrame(() => {
      resizeFrame.current = null;
      const chart = chartInstance.current;
      const element = container.current;
      if (!chart || chart.isDisposed() || !element) return;

      // Read the committed CSS geometry, not a potentially stale observer entry.
      const bounds = element.getBoundingClientRect();
      const width = Math.floor(bounds.width);
      const height = Math.floor(bounds.height);
      if (width <= 0 || height <= 0) return;

      if (Math.abs(chart.getWidth() - width) >= 1 || Math.abs(chart.getHeight() - height) >= 1) {
        chart.resize({ width, height, silent: true });
      }
    });
  }, []);

  useLayoutEffect(() => {
    resizeChartToContainer();
  }, [measuredSize, resizeChartToContainer]);

  const registerChart = useCallback((chart: ResizableChart) => {
    chartInstance.current = chart;
    resizeChartToContainer();
  }, [resizeChartToContainer]);

  useEffect(() => {
    if (!options.hasPanels) return;
    const initial = getInitialViewport(options.domainStartSeconds, options.domainEndSeconds, options.initialVisibleFraction);
    dispatchViewport({ ...initial, pixelWidth: chartWidth.current });
    options.onMetricsViewportChange(initial.startSeconds, initial.endSeconds, true);
  }, [options.hasPanels, options.domainStartSeconds, options.domainEndSeconds, options.initialVisibleFraction, dispatchViewport, options.onMetricsViewportChange]);

  useEffect(() => {
    const element = container.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    let previousWidth = 0;
    let previousHeight = 0;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      const width = Math.floor(entry?.contentRect.width ?? 0);
      const height = Math.floor(entry?.contentRect.height ?? 0);
      if (width <= 0 || height <= 0) return;

      const widthChanged = Math.abs(width - previousWidth) >= 1;
      const heightChanged = Math.abs(height - previousHeight) >= 1;
      if (!widthChanged && !heightChanged) return;

      previousWidth = width;
      previousHeight = height;
      if (widthChanged || heightChanged) {
        setMeasuredSize((current) => current.width === width && current.height === height
          ? current
          : { width, height });
        resizeChartToContainer();
      }

      if (widthChanged) {
        chartWidth.current = width;
        const viewport = lastViewport.current;
        if (viewport) dispatchViewport({ ...viewport, pixelWidth: width });
      }
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [dispatchViewport, resizeChartToContainer]);

  useEffect(() => () => {
    if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
    if (resizeFrame.current !== null) cancelAnimationFrame(resizeFrame.current);
    chartInstance.current = null;
  }, []);

  const requestInitialViewport = useCallback((chart: { getWidth: () => number }) => {
    chartWidth.current = Math.max(1, Math.floor(chart.getWidth()));
    const initial = getInitialViewport(
      latestProps.current.domainStartSeconds,
      latestProps.current.domainEndSeconds,
      latestProps.current.initialVisibleFraction,
    );
    dispatchViewport({ ...initial, pixelWidth: chartWidth.current });
    latestProps.current.onMetricsViewportChange(initial.startSeconds, initial.endSeconds, true);
  }, [dispatchViewport]);

  const handleDataZoom = useCallback((event: DataZoomRangeEvent) => {
    const zoomEvents = event.batch?.length ? event.batch : [event];
    if (zoomEvents.every((item) => item.dataZoomId?.startsWith(CHART_DATA_ZOOM_IDS.verticalInsidePrefix))) return;
    const viewport = resolveDataZoomViewport(
      event,
      latestProps.current.domainStartSeconds,
      latestProps.current.domainEndSeconds,
    );
    if (!viewport) return;
    dispatchViewport({ ...viewport, pixelWidth: chartWidth.current });
    latestProps.current.onMetricsViewportChange(viewport.startSeconds, viewport.endSeconds, false);
  }, [dispatchViewport]);

  return { container, chartHeight, measuredWidth, registerChart, requestInitialViewport, handleDataZoom, resizeChartToContainer };
}
