'use client';

import type uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import './uplot-signal-chart.css';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import type { SignalChartPanel } from '@/features/comparison/chart/signal-chart-types';
import { CHART_INTENTS } from '@/intents/chart-intents';
import { buildSignalPanelData } from '@/features/comparison/chart/signal-chart-data';
import { clampChartRange, type ChartViewport } from '@/features/comparison/chart/chart-range';
import { createSignalChart } from '@/features/comparison/chart/uplot/create-signal-chart';
import { resolveSamplingPixelWidth } from '@/features/comparison/chart/sampling-budget';
import {
  MAX_CHART_ZOOM_FACTOR,
  MIN_CHART_SPAN_SECONDS,
  SIGNAL_CHART_HEIGHT,
} from '@/features/comparison/chart/chart-constants';
import { COMPARISON_LABELS as LABELS } from '@/constants/comparison-labels';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MeasurementInspectionTooltip } from './measurement-inspection-tooltip';

interface UPlotSignalChartProps {
  readonly panels: readonly SignalChartPanel[];
  readonly domainStartSeconds: number;
  readonly domainEndSeconds: number;
  readonly initialVisibleFraction: number;
  readonly onViewportChange: (startSeconds: number, endSeconds: number, pixelWidth: number) => void;
  readonly onMetricsViewportChange: (
    startSeconds: number,
    endSeconds: number,
    isInitial: boolean,
  ) => void;
}

function SignalPlotRow({
  panel,
  index,
  count,
  domainStart,
  domainEnd,
  initialRange,
  viewport,
  onViewport,
  onInitialViewport,
  onInspect,
}: {
  panel: SignalChartPanel;
  index: number;
  count: number;
  domainStart: number;
  domainEnd: number;
  initialRange: ChartViewport;
  viewport: ChartViewport;
  onViewport: (range: ChartViewport, width: number) => void;
  onInitialViewport: (range: ChartViewport, width: number) => void;
  onInspect: (time: number, clientX: number, clientY: number) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);
  const appliedDataRef = useRef<uPlot.AlignedData | null>(null);
  const data = useMemo(() => buildSignalPanelData(panel), [panel]);
  const [referenceVisible, setReferenceVisible] = useState(true);
  const [comparisonVisible, setComparisonVisible] = useState(true);

  useEffect(() => {
    const host = hostRef.current;

    if (!host) return;

    const chart = createSignalChart({
      host,
      panel,
      index,
      count,
      data,
      domainStart,
      domainEnd,
      initialRange,
      onViewport,
      onInspect,
      onInitialViewport,
    });
    chartRef.current = chart;
    appliedDataRef.current = data;
    const resize = new ResizeObserver(([entry]) => {
      const nextWidth = Math.floor(entry?.contentRect.width ?? 0);
      const nextHeight = Math.floor(entry?.contentRect.height ?? 0);

      if (nextWidth > 0 && nextHeight > 0) {
        chart.setSize({ width: nextWidth, height: nextHeight });

        if (index === 0) {
          const scale = chart.scales.x;

          if (scale.min !== undefined && scale.max !== undefined) {
            const plotWidth = Math.max(1, Math.floor(chart.over.getBoundingClientRect().width));
            onViewport({ min: scale.min, max: scale.max }, resolveSamplingPixelWidth(plotWidth));
          }
        }
      }
    });
    resize.observe(host);
    return () => {
      resize.disconnect();
      chart.destroy();
      chartRef.current = null;
      appliedDataRef.current = null;
    };
    // Chart identity is tied to panel identity and the selected domain.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel.id, panel.color, index, count, domainStart, domainEnd]);

  useEffect(() => {
    const chart = chartRef.current;

    if (!chart) return;

    if (appliedDataRef.current !== data) {
      chart.setData(data, true);
      appliedDataRef.current = data;
    }

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
            {panel.unit && (
              <span className="ml-1.5 font-normal text-muted-foreground">({panel.unit})</span>
            )}
          </h3>
          <Popover>
            <PopoverTrigger
              aria-label={`About ${panel.label}`}
              className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Info className="size-3.5" />
            </PopoverTrigger>
            <PopoverContent className="w-56 space-y-3 p-3" side="right" align="center">
              <div>
                <p className="text-sm font-medium">{panel.label}</p>
                <p className="text-xs text-muted-foreground">
                  {panel.unit || 'Unit not specified'}
                </p>
              </div>
              <div className="space-y-2 text-xs">
                <button
                  type="button"
                  aria-pressed={referenceVisible}
                  onClick={() => setReferenceVisible((value) => !value)}
                  className="flex w-full items-center gap-2 text-left"
                >
                  <span
                    className="w-6 border-t border-dashed"
                    style={{ borderColor: panel.color }}
                  />
                  {LABELS.referenceSeries}
                  <span className="ml-auto text-muted-foreground">
                    {referenceVisible ? 'Visible' : 'Hidden'}
                  </span>
                </button>
                <button
                  type="button"
                  aria-pressed={comparisonVisible}
                  onClick={() => setComparisonVisible((value) => !value)}
                  className="flex w-full items-center gap-2 text-left"
                >
                  <span className="w-6 border-t-2" style={{ borderColor: panel.color }} />
                  {LABELS.comparisonSeries}
                  <span className="ml-auto text-muted-foreground">
                    {comparisonVisible ? 'Visible' : 'Hidden'}
                  </span>
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        {index === 0 && (
          <div
            className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"
            aria-label="Chart legend"
          >
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
      <div className={`flex min-w-0 ${SIGNAL_CHART_HEIGHT}`}>
        <div
          ref={hostRef}
          className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-md border bg-background"
          data-testid="signal-chart"
          role="img"
          aria-label={`${panel.label} comparison chart`}
        ></div>
      </div>
    </section>
  );
}

export function UPlotSignalChart({
  panels,
  domainStartSeconds,
  domainEndSeconds,
  initialVisibleFraction,
  onViewportChange,
  onMetricsViewportChange,
}: UPlotSignalChartProps) {
  const initialRange = useMemo(
    () =>
      clampChartRange(
        domainStartSeconds + (domainEndSeconds - domainStartSeconds) * (1 - initialVisibleFraction),
        domainEndSeconds,
        domainStartSeconds,
        domainEndSeconds,
      ),
    [domainEndSeconds, domainStartSeconds, initialVisibleFraction],
  );
  const [viewportState, setViewportState] = useState({ initialRange, value: initialRange });
  const viewport = viewportState.initialRange === initialRange ? viewportState.value : initialRange;
  const groupRef = useRef<HTMLDivElement>(null);
  const [groupSize, setGroupSize] = useState({ width: 0, height: 0 });
  const [inspection, setInspection] = useState<{ time: number; x: number; y: number } | null>(null);
  const handleInspect = useCallback((time: number, clientX: number, clientY: number) => {
    const bounds = groupRef.current?.getBoundingClientRect();

    if (!bounds) return;

    setInspection({ time, x: clientX - bounds.left, y: clientY - bounds.top });
  }, []);
  const clearInspection = useCallback(() => setInspection(null), []);
  const samplingWidthRef = useRef(1);
  const viewportRef = useRef(viewport);
  const callbacksRef = useRef({ onViewportChange, onMetricsViewportChange });

  useLayoutEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  useLayoutEffect(() => {
    callbacksRef.current = { onViewportChange, onMetricsViewportChange };
  }, [onViewportChange, onMetricsViewportChange]);

  useEffect(() => {
    const group = groupRef.current;

    if (!group) return;

    const observer = new ResizeObserver(([entry]) => {
      const next = {
        width: Math.floor(entry?.contentRect.width ?? 0),
        height: Math.floor(entry?.contentRect.height ?? 0),
      };
      setGroupSize((current) =>
        current.width === next.width && current.height === next.height ? current : next,
      );
    });

    observer.observe(group);
    return () => observer.disconnect();
  }, []);

  const handleViewport = useCallback(
    (range: ChartViewport, width: number) => {
      setViewportState({ initialRange, value: range });
      samplingWidthRef.current = width;
      callbacksRef.current.onViewportChange(range.min, range.max, width);
      callbacksRef.current.onMetricsViewportChange(range.min, range.max, false);
      const factor = Math.min(
        MAX_CHART_ZOOM_FACTOR,
        (domainEndSeconds - domainStartSeconds) /
          Math.max(MIN_CHART_SPAN_SECONDS, range.max - range.min),
      );
      window.dispatchEvent(
        new CustomEvent(CHART_INTENTS.HORIZONTAL_ZOOM_CHANGED, { detail: { factor } }),
      );
    },
    [domainEndSeconds, domainStartSeconds, initialRange],
  );

  const handleInitialViewport = useCallback(
    (range: ChartViewport, width: number) => {
      samplingWidthRef.current = width;
      callbacksRef.current.onViewportChange(range.min, range.max, width);
      callbacksRef.current.onMetricsViewportChange(range.min, range.max, true);
      window.dispatchEvent(
        new CustomEvent(CHART_INTENTS.HORIZONTAL_ZOOM_CHANGED, {
          detail: {
            factor: Math.min(MAX_CHART_ZOOM_FACTOR, 1 / Math.max(0.05, initialVisibleFraction)),
          },
        }),
      );
    },
    [initialVisibleFraction],
  );

  useEffect(() => {
    const reset = () =>
      handleViewport({ min: domainStartSeconds, max: domainEndSeconds }, samplingWidthRef.current);
    const zoom = (event: Event) => {
      const factor = (event as CustomEvent<{ factor?: number }>).detail?.factor;

      if (typeof factor !== 'number' || !Number.isFinite(factor)) return;

      const bounded = Math.max(1, Math.min(MAX_CHART_ZOOM_FACTOR, factor));
      const span = (domainEndSeconds - domainStartSeconds) / bounded;
      const center = (viewportRef.current.min + viewportRef.current.max) / 2;
      handleViewport(
        clampChartRange(center - span / 2, center + span / 2, domainStartSeconds, domainEndSeconds),
        samplingWidthRef.current,
      );
    };
    window.addEventListener(CHART_INTENTS.RESET_ZOOM, reset);
    window.addEventListener(CHART_INTENTS.SET_HORIZONTAL_ZOOM, zoom);
    return () => {
      window.removeEventListener(CHART_INTENTS.RESET_ZOOM, reset);
      window.removeEventListener(CHART_INTENTS.SET_HORIZONTAL_ZOOM, zoom);
    };
  }, [domainEndSeconds, domainStartSeconds, handleViewport]);

  return (
    <div
      ref={groupRef}
      className="relative flex min-w-0 flex-col gap-2"
      data-testid="signal-chart-group"
      aria-label={LABELS.chartGroupLabel}
      onPointerLeave={clearInspection}
    >
      {panels.map((panel, index) => (
        <div key={panel.id}>
          {index > 0 && <div className="my-2 border-t border-border/60" />}
          <SignalPlotRow
            panel={panel}
            index={index}
            count={panels.length}
            domainStart={domainStartSeconds}
            domainEnd={domainEndSeconds}
            initialRange={initialRange}
            viewport={viewport}
            onViewport={handleViewport}
            onInitialViewport={handleInitialViewport}
            onInspect={handleInspect}
          />
        </div>
      ))}
      {inspection && (
        <MeasurementInspectionTooltip
          panels={panels}
          time={inspection.time}
          x={inspection.x}
          y={inspection.y}
          width={groupSize.width}
          height={groupSize.height}
        />
      )}
    </div>
  );
}
