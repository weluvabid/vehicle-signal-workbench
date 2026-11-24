'use client';

import { useCallback, useEffect, useRef } from 'react';
import type * as echarts from 'echarts/core';
import { getWheelZoomRange } from './wheel-zoom';
import { CHART_DATA_ZOOM_IDS, CHART_INTENTS, getVerticalZoomId } from '@/intents/chart-intents';

interface ChartInteractionsOptions {
  readonly panelCount: number;
}

type ZoomRange = { readonly id?: string; readonly start?: number; readonly end?: number };

type TouchGesture = {
  readonly start: number;
  readonly end: number;
  readonly anchorValue: number;
  readonly initialDistance: number;
  readonly plotWidth: number;
};

function getTouchDistance(first: Touch, second: Touch): number {
  return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
}

function getZoomRanges(chart: echarts.EChartsType): ZoomRange[] {
  const dataZoom = chart.getOption().dataZoom;
  return Array.isArray(dataZoom) ? (dataZoom as ZoomRange[]) : [];
}

function dispatchDataZoom(chart: echarts.EChartsType, payload: Record<string, unknown>): void {
  chart.dispatchAction({ type: 'hideTip' });
  chart.dispatchAction({ type: 'dataZoom', ...payload } as Parameters<
    typeof chart.dispatchAction
  >[0]);
}

export function useChartInteractions({ panelCount }: ChartInteractionsOptions) {
  const chartRef = useRef<echarts.EChartsType | null>(null);
  const targetRef = useRef<HTMLElement | null>(null);
  const handlerRef = useRef<((event: WheelEvent) => void) | null>(null);
  const touchGestureRef = useRef<TouchGesture | null>(null);
  const zoomListenerRef = useRef<((event?: unknown) => void) | null>(null);

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      const chart = chartRef.current;

      if (!chart || chart.isDisposed()) return;

      const modifierCount =
        Number(event.metaKey) +
        Number(event.ctrlKey) +
        Number(event.shiftKey) +
        Number(event.altKey);

      if (modifierCount === 0) {
        event.stopImmediatePropagation();
        return;
      }

      if (modifierCount !== 1) return;

      const zooms = getZoomRanges(chart);
      const horizontal = zooms.find((item) => item.id === CHART_DATA_ZOOM_IDS.horizontalInside);

      if (typeof horizontal?.start !== 'number' || typeof horizontal.end !== 'number') return;

      const delta = event.deltaY !== 0 ? event.deltaY : event.deltaX;

      if (!Number.isFinite(delta) || delta === 0) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      if (event.metaKey || event.ctrlKey) {
        const bounds = chart.getDom().getBoundingClientRect();
        const plotLeft = 56;
        const plotRight = 20;
        const anchor = Math.min(
          1,
          Math.max(
            0,
            (event.clientX - bounds.left - plotLeft) /
              Math.max(1, bounds.width - plotLeft - plotRight),
          ),
        );
        const minimumSpan = 5;
        const next = getWheelZoomRange(
          { start: horizontal.start, end: horizontal.end },
          delta,
          anchor,
          minimumSpan,
        );

        if (next)
          dispatchDataZoom(chart, {
            dataZoomId: CHART_DATA_ZOOM_IDS.horizontalInside,
            start: next.start,
            end: next.end,
          });

        return;
      }

      if (event.shiftKey) {
        const span = horizontal.end - horizontal.start;
        const start = Math.min(100 - span, Math.max(0, horizontal.start + delta * 0.04));
        dispatchDataZoom(chart, {
          dataZoomId: CHART_DATA_ZOOM_IDS.horizontalInside,
          start,
          end: start + span,
        });
        return;
      }

      const bounds = chart.getDom().getBoundingClientRect();
      const panelSlot = (bounds.height - 42 - 16) / Math.max(1, panelCount);
      const index = Math.max(
        0,
        Math.min(panelCount - 1, Math.floor((event.clientY - bounds.top - 8) / panelSlot)),
      );
      const id = getVerticalZoomId(index);
      const current = zooms.find((item) => item.id === id);
      const start = current?.start ?? 0;
      const end = current?.end ?? 100;
      const panelTop = bounds.top + 8 + index * panelSlot + 64;
      const panelHeight = Math.max(1, panelSlot - 100);
      const anchor = Math.min(1, Math.max(0, 1 - (event.clientY - panelTop) / panelHeight));
      const span = end - start;
      const nextSpan = Math.max(2, Math.min(100, span * Math.exp(delta * 0.002)));
      const anchorValue = start + span * anchor;
      const nextStart = Math.max(0, Math.min(100 - nextSpan, anchorValue - nextSpan * anchor));
      dispatchDataZoom(chart, {
        dataZoomId: id,
        start: nextStart,
        end: nextStart + nextSpan,
      });
    },
    [panelCount],
  );

  const handleTouchStart = useCallback((event: TouchEvent) => {
    if (event.touches.length !== 2) {
      touchGestureRef.current = null;
      return;
    }

    const chart = chartRef.current;

    if (!chart || chart.isDisposed()) return;

    // Own two-finger gestures before ECharts interprets them as independent touches.
    event.stopImmediatePropagation();
    const zoom = getZoomRanges(chart).find(
      (item) => item.id === CHART_DATA_ZOOM_IDS.horizontalInside,
    );

    if (typeof zoom?.start !== 'number' || typeof zoom.end !== 'number') return;

    const bounds = chart.getDom().getBoundingClientRect();
    const plotLeft = 56;
    const plotRight = 20;
    const plotWidth = Math.max(1, bounds.width - plotLeft - plotRight);
    const first = event.touches[0];
    const second = event.touches[1];
    const centerX = (first.clientX + second.clientX) / 2;
    const anchor = Math.min(1, Math.max(0, (centerX - bounds.left - plotLeft) / plotWidth));
    const span = zoom.end - zoom.start;

    touchGestureRef.current = {
      start: zoom.start,
      end: zoom.end,
      anchorValue: zoom.start + span * anchor,
      initialDistance: Math.max(1, getTouchDistance(first, second)),
      plotWidth,
    };
  }, []);

  const handleTouchMove = useCallback((event: TouchEvent) => {
    if (event.touches.length !== 2) {
      touchGestureRef.current = null;
      return;
    }

    const gesture = touchGestureRef.current;
    const chart = chartRef.current;

    if (!gesture || !chart || chart.isDisposed()) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const first = event.touches[0];
    const second = event.touches[1];
    const bounds = chart.getDom().getBoundingClientRect();
    const centerX = (first.clientX + second.clientX) / 2;
    const plotFraction = Math.min(1, Math.max(0, (centerX - bounds.left - 56) / gesture.plotWidth));
    const distance = Math.max(1, getTouchDistance(first, second));
    const initialSpan = gesture.end - gesture.start;
    const nextSpan = Math.min(100, Math.max(5, (initialSpan * gesture.initialDistance) / distance));
    const nextStart = Math.min(
      100 - nextSpan,
      Math.max(0, gesture.anchorValue - nextSpan * plotFraction),
    );

    dispatchDataZoom(chart, {
      dataZoomId: CHART_DATA_ZOOM_IDS.horizontalInside,
      start: nextStart,
      end: nextStart + nextSpan,
    });
  }, []);

  const handleTouchEnd = useCallback((event: TouchEvent) => {
    if (event.touches.length < 2) touchGestureRef.current = null;
  }, []);

  const setHorizontalZoom = useCallback((event: Event) => {
    const chart = chartRef.current;

    if (!chart || chart.isDisposed()) return;

    const factor = (event as CustomEvent<{ factor?: number }>).detail?.factor;

    if (typeof factor !== 'number' || !Number.isFinite(factor) || factor <= 1) {
      dispatchDataZoom(chart, {
        dataZoomId: CHART_DATA_ZOOM_IDS.horizontalInside,
        start: 0,
        end: 100,
      });
      return;
    }

    const boundedFactor = Math.min(20, Math.max(1, factor));
    const span = 100 / boundedFactor;
    const current = getZoomRanges(chart).find(
      (item) => item.id === CHART_DATA_ZOOM_IDS.horizontalInside,
    );
    const center =
      typeof current?.start === 'number' && typeof current.end === 'number'
        ? (current.start + current.end) / 2
        : 50;
    const start = Math.max(0, Math.min(100 - span, center - span / 2));
    dispatchDataZoom(chart, {
      dataZoomId: CHART_DATA_ZOOM_IDS.horizontalInside,
      start,
      end: start + span,
    });
  }, []);

  const attachChart = useCallback(
    (chart: echarts.EChartsType) => {
      if (chartRef.current && !chartRef.current.isDisposed() && zoomListenerRef.current) {
        chartRef.current.off('datazoom', zoomListenerRef.current);
      }

      if (targetRef.current) {
        if (handlerRef.current)
          targetRef.current.removeEventListener('wheel', handlerRef.current, true);

        targetRef.current.removeEventListener('touchstart', handleTouchStart, true);
        targetRef.current.removeEventListener('touchmove', handleTouchMove, true);
        targetRef.current.removeEventListener('touchend', handleTouchEnd, true);
        targetRef.current.removeEventListener('touchcancel', handleTouchEnd, true);
      }

      chartRef.current = chart;
      const hideTooltipDuringZoom = () => {
        if (!chart.isDisposed()) chart.dispatchAction({ type: 'hideTip' });
      };
      chart.on('datazoom', hideTooltipDuringZoom);
      zoomListenerRef.current = hideTooltipDuringZoom;
      const target = chart.getDom();
      target.addEventListener('wheel', handleWheel, { passive: false, capture: true });
      target.addEventListener('touchstart', handleTouchStart, { capture: true, passive: true });
      target.addEventListener('touchmove', handleTouchMove, { capture: true, passive: false });
      target.addEventListener('touchend', handleTouchEnd, { capture: true, passive: true });
      target.addEventListener('touchcancel', handleTouchEnd, { capture: true, passive: true });
      targetRef.current = target;
      handlerRef.current = handleWheel;
    },
    [handleTouchEnd, handleTouchMove, handleTouchStart, handleWheel],
  );

  const resetAllZoom = useCallback(() => {
    const chart = chartRef.current;

    if (!chart || chart.isDisposed()) return;

    dispatchDataZoom(chart, {
      dataZoomId: CHART_DATA_ZOOM_IDS.horizontalInside,
      start: 0,
      end: 100,
    });

    for (let index = 0; index < panelCount; index += 1) {
      dispatchDataZoom(chart, {
        dataZoomId: getVerticalZoomId(index),
        start: 0,
        end: 100,
      });
    }
  }, [panelCount]);

  useEffect(() => {
    window.addEventListener(CHART_INTENTS.RESET_ZOOM, resetAllZoom);
    window.addEventListener(CHART_INTENTS.SET_HORIZONTAL_ZOOM, setHorizontalZoom);
    return () => {
      window.removeEventListener(CHART_INTENTS.RESET_ZOOM, resetAllZoom);
      window.removeEventListener(CHART_INTENTS.SET_HORIZONTAL_ZOOM, setHorizontalZoom);
    };
  }, [resetAllZoom, setHorizontalZoom]);

  useEffect(
    () => () => {
      if (targetRef.current) {
        if (handlerRef.current)
          targetRef.current.removeEventListener('wheel', handlerRef.current, true);

        targetRef.current.removeEventListener('touchstart', handleTouchStart, true);
        targetRef.current.removeEventListener('touchmove', handleTouchMove, true);
        targetRef.current.removeEventListener('touchend', handleTouchEnd, true);
        targetRef.current.removeEventListener('touchcancel', handleTouchEnd, true);
      }

      if (chartRef.current && !chartRef.current.isDisposed() && zoomListenerRef.current) {
        chartRef.current.off('datazoom', zoomListenerRef.current);
      }

      zoomListenerRef.current = null;
      touchGestureRef.current = null;
      chartRef.current = null;
    },
    [handleTouchEnd, handleTouchMove, handleTouchStart],
  );

  return { attachChart };
}
