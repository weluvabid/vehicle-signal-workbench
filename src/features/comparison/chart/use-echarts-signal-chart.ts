'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { resolveDataZoomViewport, type DataZoomRangeEvent } from '@/components/comparison/chart-viewport';

interface PendingViewport {
  readonly startSeconds: number;
  readonly endSeconds: number;
  readonly pixelWidth: number;
}

interface ChartControllerOptions {
  readonly domainStartSeconds: number;
  readonly domainEndSeconds: number;
  readonly onViewportChange: (startSeconds: number, endSeconds: number, pixelWidth: number) => void;
  readonly onTableViewportChange: (startSeconds: number, endSeconds: number) => void;
  readonly onFpsChange: (fps: number) => void;
  readonly hasPanels: boolean;
}

/** Owns chart interaction, RAF viewport dispatch, resize and FPS lifecycles. */
export function useEChartsSignalChart(options: ChartControllerOptions) {
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
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const latestProps = useRef(options);

  useEffect(() => { latestProps.current = options; }, [options]);

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
        latestProps.current.onFpsChange(Math.round(((fpsFrames.current - 1) * 1000) / elapsed));
        fpsWindowStart.current = now;
        fpsFrames.current = 1;
      }
      if (now - fpsLastInteraction.current < 900) {
        fpsFrame.current = requestAnimationFrame(tick);
      } else {
        const finalElapsed = now - fpsWindowStart.current;
        if (finalElapsed >= 100 && fpsFrames.current > 1) {
          latestProps.current.onFpsChange(Math.round(((fpsFrames.current - 1) * 1000) / finalElapsed));
        }
        fpsFrame.current = null;
      }
    };
    fpsFrame.current = requestAnimationFrame(tick);
  }, []);

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

  useEffect(() => {
    if (!options.hasPanels) return;
    dispatchViewport({
      startSeconds: options.domainStartSeconds,
      endSeconds: options.domainEndSeconds,
      pixelWidth: chartWidth.current,
    });
    options.onTableViewportChange(options.domainStartSeconds, options.domainEndSeconds);
  }, [options.hasPanels, options.domainStartSeconds, options.domainEndSeconds, dispatchViewport, options.onTableViewportChange]);

  useEffect(() => {
    const element = container.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    let previousWidth = 0;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      const width = Math.floor(entry?.contentRect.width ?? 0);
      const height = Math.floor(entry?.contentRect.height ?? 0);
      if (width > 0 && Math.abs(width - previousWidth) >= 1) {
        previousWidth = width;
        setMeasuredWidth((current) => current === width ? current : width);
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
    latestProps.current.onTableViewportChange(
      latestProps.current.domainStartSeconds,
      latestProps.current.domainEndSeconds,
    );
  }, [dispatchViewport]);

  const handleDataZoom = useCallback((event: DataZoomRangeEvent) => {
    recordInteraction();
    const viewport = resolveDataZoomViewport(
      event,
      latestProps.current.domainStartSeconds,
      latestProps.current.domainEndSeconds,
    );
    if (!viewport) return;
    dispatchViewport({ ...viewport, pixelWidth: chartWidth.current });
    latestProps.current.onTableViewportChange(viewport.startSeconds, viewport.endSeconds);
  }, [dispatchViewport, recordInteraction]);

  const handlePointerDown = useCallback(() => { pointerActive.current = true; recordInteraction(); }, [recordInteraction]);
  const handlePointerMove = useCallback(() => { if (pointerActive.current) recordInteraction(); }, [recordInteraction]);
  const handlePointerEnd = useCallback(() => { pointerActive.current = false; }, []);

  return {
    container, chartHeight, measuredWidth, recordInteraction,
    requestInitialViewport, handleDataZoom,
    handlePointerDown, handlePointerMove, handlePointerEnd,
  };
}
