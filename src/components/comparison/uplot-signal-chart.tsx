'use client';

import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import './uplot-signal-chart.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import type { SignalChartPanel } from './signal-chart-types';
import { CHART_INTENTS } from '@/intents/chart-intents';
import { resolveSamplingPixelWidth } from '@/features/comparison/chart/sampling-budget';
import { COMPARISON_LABELS as LABELS } from '@/constants/comparison-labels';
import { formatChartValue } from './chart-value-format';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MeasurementInspectionTooltip } from './measurement-inspection-tooltip';

interface UPlotSignalChartProps {
  readonly panels: readonly SignalChartPanel[];
  readonly domainStartSeconds: number;
  readonly domainEndSeconds: number;
  readonly initialVisibleFraction: number;
  readonly onViewportChange: (startSeconds: number, endSeconds: number, pixelWidth: number) => void;
  readonly onMetricsViewportChange: (startSeconds: number, endSeconds: number, isInitial: boolean) => void;
}

interface Viewport { readonly min: number; readonly max: number }
const MIN_SPAN_SECONDS = 0.001;
const MAX_ZOOM_FACTOR = 20;
const CHART_HEIGHT = 'h-[224px] sm:h-[240px] lg:h-[260px]';

function clampRange(start: number, end: number, domainStart: number, domainEnd: number): Viewport {
  const domainSpan = domainEnd - domainStart;
  const span = Math.min(domainSpan, Math.max(MIN_SPAN_SECONDS, end - start));
  const boundedStart = Math.max(domainStart, Math.min(domainEnd - span, start));
  return { min: boundedStart, max: boundedStart + span };
}

function sampleValue(points: readonly [number, number | null][], target: number): number | null {
  let low = 0;
  let high = points.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (points[middle][0] < target) low = middle + 1;
    else high = middle;
  }
  const right = points[low];
  if (right && right[0] === target) return right[1] !== null && Number.isFinite(right[1]) ? right[1] : null;
  const left = points[low - 1];
  if (!left || !right || left[1] === null || right[1] === null) return null;
  if (!Number.isFinite(left[1]) || !Number.isFinite(right[1])) return null;
  const span = right[0] - left[0];
  if (!(span > 0)) return null;
  return left[1] + (right[1] - left[1]) * ((target - left[0]) / span);
}

function buildPanelData(panel: SignalChartPanel): uPlot.AlignedData {
  const times = new Set<number>();
  for (const [time] of panel.reference) if (Number.isFinite(time)) times.add(time);
  for (const [time] of panel.comparison) if (Number.isFinite(time)) times.add(time);
  const x = [...times].sort((a, b) => a - b);
  return [x, x.map((time) => sampleValue(panel.reference, time)), x.map((time) => sampleValue(panel.comparison, time))];
}

function plotWidth(element: HTMLElement): number {
  return Math.max(1, Math.floor(element.getBoundingClientRect().width));
}

function createNavigationPlugin(
  domainStart: number,
  domainEnd: number,
  notify: (range: Viewport, width: number) => void,
  inspect: (time: number, clientX: number, clientY: number) => void,
  clearInspection: () => void,
): uPlot.Plugin {
  return {
    hooks: {
      ready: [(u) => {
        const over = u.over;
        let drag: { pointerId: number; x: number; min: number; max: number } | null = null;
        let frame = 0;
        let pending: Viewport | null = null;
        let inspectFrame = 0;
        let pendingInspection: { time: number; clientX: number; clientY: number } | null = null;
        const pointerMove = (event: PointerEvent) => {
          const bounds = over.getBoundingClientRect();
          const x = event.clientX - bounds.left;
          const time = u.posToVal(x, 'x');
          if (!Number.isFinite(time)) return;
          pendingInspection = { time, clientX: event.clientX, clientY: event.clientY };
          if (inspectFrame) return;
          inspectFrame = requestAnimationFrame(() => {
            inspectFrame = 0;
            if (pendingInspection) inspect(pendingInspection.time, pendingInspection.clientX, pendingInspection.clientY);
            pendingInspection = null;
          });
        };
        const pointerLeave = () => {
          if (inspectFrame) cancelAnimationFrame(inspectFrame);
          inspectFrame = 0;
          pendingInspection = null;
          clearInspection();
        };
        const emit = (min: number, max: number) => {
          pending = clampRange(min, max, domainStart, domainEnd);
          if (frame) return;
          frame = requestAnimationFrame(() => {
            frame = 0;
            if (!pending) return;
            const next = pending;
            pending = null;
            u.setScale('x', next);
            notify(next, resolveSamplingPixelWidth(plotWidth(over)));
          });
        };
        const down = (event: PointerEvent) => {
          if (event.pointerType === 'touch' || event.button !== 0) return;
          const scale = u.scales.x;
          if (scale.min === undefined || scale.max === undefined) return;
          drag = { pointerId: event.pointerId, x: event.clientX, min: scale.min, max: scale.max };
          over.setPointerCapture(event.pointerId);
          event.preventDefault();
        };
        const move = (event: PointerEvent) => {
          if (!drag || drag.pointerId !== event.pointerId) return;
          const delta = ((event.clientX - drag.x) / plotWidth(over)) * (drag.max - drag.min);
          emit(drag.min - delta, drag.max - delta);
        };
        const up = (event: PointerEvent) => {
          if (!drag || drag.pointerId !== event.pointerId) return;
          drag = null;
          if (over.hasPointerCapture(event.pointerId)) over.releasePointerCapture(event.pointerId);
        };
        const wheel = (event: WheelEvent) => {
          if (!(event.ctrlKey || event.metaKey || event.shiftKey)) return;
          const scale = u.scales.x;
          if (scale.min === undefined || scale.max === undefined) return;
          const delta = event.deltaY || event.deltaX;
          if (!Number.isFinite(delta) || delta === 0) return;
          event.preventDefault();
          event.stopPropagation();
          const span = scale.max - scale.min;
          if (event.shiftKey && !event.ctrlKey && !event.metaKey) {
            const shift = (delta / 100) * span * 0.08;
            emit(scale.min + shift, scale.max + shift);
            return;
          }
          const factor = Math.exp(Math.max(-2, Math.min(2, delta * 0.002)));
          const nextSpan = Math.min(domainEnd - domainStart, Math.max((domainEnd - domainStart) / MAX_ZOOM_FACTOR, span * factor));
          const bounds = over.getBoundingClientRect();
          const fraction = Math.min(1, Math.max(0, (event.clientX - bounds.left) / Math.max(1, bounds.width)));
          const anchor = scale.min + span * fraction;
          emit(anchor - nextSpan * fraction, anchor + nextSpan * (1 - fraction));
        };
        over.addEventListener('pointermove', pointerMove);
        over.addEventListener('pointerleave', pointerLeave);
        over.addEventListener('pointerdown', down);
        over.addEventListener('pointermove', move);
        over.addEventListener('pointerup', up);
        over.addEventListener('pointercancel', up);
        over.addEventListener('wheel', wheel, { passive: false });
        (u as uPlot & { __vswCleanup?: () => void }).__vswCleanup = () => {
          if (frame) cancelAnimationFrame(frame);
          if (inspectFrame) cancelAnimationFrame(inspectFrame);
          over.removeEventListener('pointermove', pointerMove);
          over.removeEventListener('pointerleave', pointerLeave);
          over.removeEventListener('pointerdown', down);
          over.removeEventListener('pointermove', move);
          over.removeEventListener('pointerup', up);
          over.removeEventListener('pointercancel', up);
          over.removeEventListener('wheel', wheel);
        };
      }],
      destroy: [(u) => (u as uPlot & { __vswCleanup?: () => void }).__vswCleanup?.()],
    },
  };
}

function SignalPlotRow({
  panel, index, count, domainStart, domainEnd, initialRange, viewport, onViewport,
  onInitialViewport,
  onInspect,
  onClearInspection,
}: {
  panel: SignalChartPanel; index: number; count: number; domainStart: number; domainEnd: number;
  initialRange: Viewport; viewport: Viewport; onViewport: (range: Viewport, width: number) => void;
  onInitialViewport: (range: Viewport, width: number) => void;
  onInspect: (time: number, clientX: number, clientY: number) => void;
  onClearInspection: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);
  const data = useMemo(() => buildPanelData(panel), [panel]);
  const [referenceVisible, setReferenceVisible] = useState(true);
  const [comparisonVisible, setComparisonVisible] = useState(true);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const width = Math.max(1, Math.floor(host.clientWidth));
    const height = Math.max(180, Math.floor(host.clientHeight));
    const foreground = getComputedStyle(host).color || '#c4c9d2';
    const border = getComputedStyle(host).borderTopColor || '#3f3f46';
    const plugin = createNavigationPlugin(domainStart, domainEnd, onViewport, onInspect, onClearInspection);
    const chart = new uPlot({
      width, height, class: 'vsw-uplot', plugins: [plugin],
      scales: { x: { time: false }, y: { auto: true, range: (_u, min, max) => {
        if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
        if (min === max) { const pad = Math.max(Math.abs(min) * 0.05, 1); return [min - pad, max + pad]; }
        const pad = (max - min) * 0.06;
        return [min - pad, max + pad];
      } } },
      axes: [
        { show: index === count - 1, stroke: foreground, grid: { stroke: border, width: 1, dash: [3, 4] }, ticks: { stroke: border, width: 1 }, values: (_u, values) => values.map((value) => `${formatChartValue(value)} s`), size: index === count - 1 ? 34 : 0 },
        { scale: 'y', side: 3, stroke: foreground, grid: { stroke: border, width: 1, dash: [3, 4] }, ticks: { stroke: border, width: 1 }, values: (_u, values) => values.map(formatChartValue), size: 58 },
      ],
      series: [ {},
        { label: LABELS.referenceSeries, stroke: panel.color, width: 1.25, alpha: 0.7, dash: [5, 4], spanGaps: false, paths: uPlot.paths.linear() },
        { label: LABELS.comparisonSeries, stroke: panel.color, width: 2, spanGaps: false, paths: uPlot.paths.linear() },
      ],
      cursor: { show: true, drag: { x: false, y: false, setScale: false }, points: { show: false }, sync: { key: 'vsw-comparison' } },
      select: { show: false }, legend: { show: false },
    }, data, host);
    chartRef.current = chart;
    chart.setScale('x', initialRange);
    if (index === 0) onInitialViewport(initialRange, resolveSamplingPixelWidth(plotWidth(chart.over)));
    const resize = new ResizeObserver(([entry]) => {
      const nextWidth = Math.floor(entry?.contentRect.width ?? 0);
      const nextHeight = Math.floor(entry?.contentRect.height ?? 0);
      if (nextWidth > 0 && nextHeight > 0) {
        chart.setSize({ width: nextWidth, height: nextHeight });
        if (index === 0) {
          const scale = chart.scales.x;
          if (scale.min !== undefined && scale.max !== undefined) {
            onViewport({ min: scale.min, max: scale.max }, resolveSamplingPixelWidth(plotWidth(chart.over)));
          }
        }
      }
    });
    resize.observe(host);
    return () => { resize.disconnect(); chart.destroy(); chartRef.current = null; };
  // Chart identity is tied to panel identity and the selected domain.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel.id, domainStart, domainEnd]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.setData(data, true);
    chart.setScale('x', viewport);
  }, [data, viewport]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.setSeries(1, { show: referenceVisible });
    chart.setSeries(2, { show: comparisonVisible });
  }, [referenceVisible, comparisonVisible]);

  return (
    <section className="min-w-0" data-testid={`signal-chart-${panel.id}`}>
      <header className="mb-3 flex min-h-8 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="truncate text-sm font-semibold leading-6 text-foreground">
            {panel.label}
            {panel.unit && <span className="ml-1.5 font-normal text-muted-foreground">({panel.unit})</span>}
          </h3>
          <Popover>
            <PopoverTrigger aria-label={`About ${panel.label}`} className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Info className="size-3.5" />
            </PopoverTrigger>
            <PopoverContent className="w-56 space-y-3 p-3" side="right" align="center">
              <div><p className="text-sm font-medium">{panel.label}</p><p className="text-xs text-muted-foreground">{panel.unit || 'Unit not specified'}</p></div>
              <div className="space-y-2 text-xs">
                <button type="button" aria-pressed={referenceVisible} onClick={() => setReferenceVisible((value) => !value)} className="flex w-full items-center gap-2 text-left"><span className="w-6 border-t border-dashed" style={{ borderColor: panel.color }} />{LABELS.referenceSeries}<span className="ml-auto text-muted-foreground">{referenceVisible ? 'Visible' : 'Hidden'}</span></button>
                <button type="button" aria-pressed={comparisonVisible} onClick={() => setComparisonVisible((value) => !value)} className="flex w-full items-center gap-2 text-left"><span className="w-6 border-t-2" style={{ borderColor: panel.color }} />{LABELS.comparisonSeries}<span className="ml-auto text-muted-foreground">{comparisonVisible ? 'Visible' : 'Hidden'}</span></button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        {index === 0 && (
          <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Chart legend">
            <span className="inline-flex items-center gap-2">
              <span className="w-5 border-t border-dashed" style={{ borderColor: panel.color }} />
              {LABELS.referenceSeries}
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="w-5 border-t-2" style={{ borderColor: panel.color }} />
              {LABELS.comparisonSeries}
            </span>
          </div>
        )}
      </header>
      <div className={`flex min-w-0 ${CHART_HEIGHT}`}>
        <div ref={hostRef} className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-md border bg-background" data-testid="signal-chart" role="img" aria-label={`${panel.label} comparison chart`}>
        </div>
      </div>
    </section>
  );
}

export function UPlotSignalChart({ panels, domainStartSeconds, domainEndSeconds, initialVisibleFraction, onViewportChange, onMetricsViewportChange }: UPlotSignalChartProps) {
  const initialRange = useMemo(() => clampRange(
    domainStartSeconds + (domainEndSeconds - domainStartSeconds) * (1 - initialVisibleFraction),
    domainEndSeconds, domainStartSeconds, domainEndSeconds,
  ), [domainEndSeconds, domainStartSeconds, initialVisibleFraction]);
  const [viewport, setViewport] = useState<Viewport>(initialRange);
  const groupRef = useRef<HTMLDivElement>(null);
  const [inspection, setInspection] = useState<{ time: number; x: number; y: number } | null>(null);
  const handleInspect = useCallback((time: number, clientX: number, clientY: number) => {
    const bounds = groupRef.current?.getBoundingClientRect();
    if (!bounds) return;
    setInspection({ time, x: clientX - bounds.left, y: clientY - bounds.top });
  }, []);
  const clearInspection = useCallback(() => setInspection(null), []);
  const samplingWidthRef = useRef(1);
  const callbacksRef = useRef({ onViewportChange, onMetricsViewportChange });
  callbacksRef.current = { onViewportChange, onMetricsViewportChange };

  useEffect(() => { setViewport(initialRange); }, [initialRange]);

  const handleViewport = useCallback((range: Viewport, width: number) => {
    setViewport(range);
    samplingWidthRef.current = width;
    callbacksRef.current.onViewportChange(range.min, range.max, width);
    callbacksRef.current.onMetricsViewportChange(range.min, range.max, false);
    const factor = Math.min(MAX_ZOOM_FACTOR, (domainEndSeconds - domainStartSeconds) / Math.max(MIN_SPAN_SECONDS, range.max - range.min));
    window.dispatchEvent(new CustomEvent(CHART_INTENTS.HORIZONTAL_ZOOM_CHANGED, { detail: { factor } }));
  }, [domainEndSeconds, domainStartSeconds]);

  const handleInitialViewport = useCallback((range: Viewport, width: number) => {
    samplingWidthRef.current = width;
    callbacksRef.current.onViewportChange(range.min, range.max, width);
    callbacksRef.current.onMetricsViewportChange(range.min, range.max, true);
    window.dispatchEvent(new CustomEvent(CHART_INTENTS.HORIZONTAL_ZOOM_CHANGED, { detail: { factor: Math.min(MAX_ZOOM_FACTOR, 1 / Math.max(0.05, initialVisibleFraction)) } }));
  }, [initialVisibleFraction]);

  useEffect(() => {
    const reset = () => handleViewport({ min: domainStartSeconds, max: domainEndSeconds }, samplingWidthRef.current);
    const zoom = (event: Event) => {
      const factor = (event as CustomEvent<{ factor?: number }>).detail?.factor;
      if (typeof factor !== 'number' || !Number.isFinite(factor)) return;
      const bounded = Math.max(1, Math.min(MAX_ZOOM_FACTOR, factor));
      const span = (domainEndSeconds - domainStartSeconds) / bounded;
      const center = (viewport.min + viewport.max) / 2;
      handleViewport(clampRange(center - span / 2, center + span / 2, domainStartSeconds, domainEndSeconds), samplingWidthRef.current);
    };
    window.addEventListener(CHART_INTENTS.RESET_ZOOM, reset);
    window.addEventListener(CHART_INTENTS.SET_HORIZONTAL_ZOOM, zoom);
    return () => { window.removeEventListener(CHART_INTENTS.RESET_ZOOM, reset); window.removeEventListener(CHART_INTENTS.SET_HORIZONTAL_ZOOM, zoom); };
  }, [domainEndSeconds, domainStartSeconds, handleViewport, viewport]);

  return (
    <div ref={groupRef} className="relative flex min-w-0 flex-col gap-2" data-testid="signal-chart-group" aria-label={LABELS.chartGroupLabel}>
      {panels.map((panel, index) => (
        <div key={panel.id}>
          {index > 0 && <div className="my-2 border-t border-border/60" />}
          <SignalPlotRow panel={panel} index={index} count={panels.length} domainStart={domainStartSeconds} domainEnd={domainEndSeconds} initialRange={initialRange} viewport={viewport} onViewport={handleViewport} onInitialViewport={handleInitialViewport} onInspect={handleInspect} onClearInspection={clearInspection} />
        </div>
      ))}
      {inspection && (
        <MeasurementInspectionTooltip
          panels={panels}
          time={inspection.time}
          x={inspection.x}
          y={inspection.y}
          width={groupRef.current?.clientWidth ?? 0}
          height={groupRef.current?.clientHeight ?? 0}
        />
      )}
    </div>
  );
}
