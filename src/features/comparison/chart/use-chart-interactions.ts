'use client';

import { useCallback, useEffect, useRef } from 'react';
import type * as echarts from 'echarts/core';
import { getWheelZoomRange } from './wheel-zoom';
import { CHART_DATA_ZOOM_IDS, CHART_INTENTS, getVerticalZoomId } from '@/intents/chart-intents';

interface ChartInteractionsOptions {
  readonly panelCount: number;
}

type ZoomRange = { readonly id?: string; readonly start?: number; readonly end?: number };

function getZoomRanges(chart: echarts.EChartsType): ZoomRange[] {
  const dataZoom = chart.getOption().dataZoom;
  return Array.isArray(dataZoom) ? dataZoom as ZoomRange[] : [];
}

export function useChartInteractions({ panelCount }: ChartInteractionsOptions) {
  const chartRef = useRef<echarts.EChartsType | null>(null);
  const targetRef = useRef<HTMLElement | null>(null);
  const handlerRef = useRef<((event: WheelEvent) => void) | null>(null);

  const handleWheel = useCallback((event: WheelEvent) => {
    const chart = chartRef.current;
    if (!chart || chart.isDisposed()) return;

    const modifierCount = Number(event.metaKey) + Number(event.ctrlKey) + Number(event.shiftKey) + Number(event.altKey);
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
      const anchor = Math.min(1, Math.max(0, (event.clientX - bounds.left - plotLeft) / Math.max(1, bounds.width - plotLeft - plotRight)));
      const minimumSpan = 5;
      const next = getWheelZoomRange({ start: horizontal.start, end: horizontal.end }, delta, anchor, minimumSpan);
      if (next) chart.dispatchAction({ type: 'dataZoom', dataZoomId: CHART_DATA_ZOOM_IDS.horizontalInside, start: next.start, end: next.end });
      return;
    }

    if (event.shiftKey) {
      const span = horizontal.end - horizontal.start;
      const start = Math.min(100 - span, Math.max(0, horizontal.start + delta * 0.04));
      chart.dispatchAction({ type: 'dataZoom', dataZoomId: CHART_DATA_ZOOM_IDS.horizontalInside, start, end: start + span });
      return;
    }

    const bounds = chart.getDom().getBoundingClientRect();
    const panelSlot = (bounds.height - 42 - 16) / Math.max(1, panelCount);
    const index = Math.max(0, Math.min(panelCount - 1, Math.floor((event.clientY - bounds.top - 8) / panelSlot)));
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
    chart.dispatchAction({ type: 'dataZoom', dataZoomId: id, start: nextStart, end: nextStart + nextSpan });
  }, [panelCount]);

  const setHorizontalZoom = useCallback((event: Event) => {
    const chart = chartRef.current;
    if (!chart || chart.isDisposed()) return;
    const factor = (event as CustomEvent<{ factor?: number }>).detail?.factor;
    if (typeof factor !== 'number' || !Number.isFinite(factor) || factor <= 1) {
      chart.dispatchAction({ type: 'dataZoom', dataZoomId: CHART_DATA_ZOOM_IDS.horizontalInside, start: 0, end: 100 });
      return;
    }
    const boundedFactor = Math.min(20, Math.max(1, factor));
    const span = 100 / boundedFactor;
    const current = getZoomRanges(chart).find((item) => item.id === CHART_DATA_ZOOM_IDS.horizontalInside);
    const center = typeof current?.start === 'number' && typeof current.end === 'number'
      ? (current.start + current.end) / 2
      : 50;
    const start = Math.max(0, Math.min(100 - span, center - span / 2));
    chart.dispatchAction({ type: 'dataZoom', dataZoomId: CHART_DATA_ZOOM_IDS.horizontalInside, start, end: start + span });
  }, []);

  const attachChart = useCallback((chart: echarts.EChartsType) => {
    if (targetRef.current && handlerRef.current) targetRef.current.removeEventListener('wheel', handlerRef.current, true);
    chartRef.current = chart;
    const target = chart.getDom();
    target.addEventListener('wheel', handleWheel, { passive: false, capture: true });
    targetRef.current = target;
    handlerRef.current = handleWheel;
  }, [handleWheel]);

  const resetAllZoom = useCallback(() => {
    const chart = chartRef.current;
    if (!chart || chart.isDisposed()) return;
    chart.dispatchAction({ type: 'dataZoom', dataZoomId: CHART_DATA_ZOOM_IDS.horizontalInside, start: 0, end: 100 });
    for (let index = 0; index < panelCount; index += 1) {
      chart.dispatchAction({ type: 'dataZoom', dataZoomId: getVerticalZoomId(index), start: 0, end: 100 });
    }
  }, [panelCount]);

  useEffect(() => {
    window.addEventListener(CHART_INTENTS.RESET_ZOOM, resetAllZoom);
    window.addEventListener(CHART_INTENTS.SET_HORIZONTAL_ZOOM, setHorizontalZoom);
    return () => { window.removeEventListener(CHART_INTENTS.RESET_ZOOM, resetAllZoom); window.removeEventListener(CHART_INTENTS.SET_HORIZONTAL_ZOOM, setHorizontalZoom); };
  }, [resetAllZoom, setHorizontalZoom]);

  useEffect(() => () => {
    if (targetRef.current && handlerRef.current) targetRef.current.removeEventListener('wheel', handlerRef.current, true);
    chartRef.current = null;
  }, []);

  return { attachChart };
}
