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
  TitleComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Equal } from 'lucide-react';
import type { SignalChartPanel } from './signal-chart-types';
import { createSignalChartOption } from './echarts-options';
import { useEChartsSignalChart } from '@/features/comparison/chart/use-echarts-signal-chart';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import type { SignalPoint } from '@/features/measurements/plot-data';

echarts.use([
  LineChart,
  GridComponent,
  TitleComponent,
  AriaComponent,
  AxisPointerComponent,
  LegendComponent,
  DataZoomInsideComponent,
  DataZoomSliderComponent,
  CanvasRenderer,
]);


interface PointerSample { readonly time: number; readonly x: number; readonly y: number }

const tooltipNumber = new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 });

/** Interpolate only between adjacent valid points; nulls remain real data gaps. */
function sampleSeries(points: readonly SignalPoint[], time: number): number | null {
  if (!Number.isFinite(time) || points.length === 0 || time < points[0][0] || time > points[points.length - 1][0]) return null;
  let low = 0;
  let high = points.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (points[middle][0] < time) low = middle + 1;
    else high = middle;
  }
  const right = points[low];
  if (right && Math.abs(right[0] - time) <= 1e-9) return right[1] !== null && Number.isFinite(right[1]) ? right[1] : null;
  const left = points[low - 1];
  if (!left || !right || left[1] === null || right[1] === null || !Number.isFinite(left[1]) || !Number.isFinite(right[1])) return null;
  const span = right[0] - left[0];
  if (!(span > 0)) return null;
  return left[1] + ((time - left[0]) / span) * (right[1] - left[1]);
}

function formatTooltipValue(value: number | null): string {
  return value === null ? 'Missing' : tooltipNumber.format(Object.is(value, -0) ? 0 : value);
}

function DifferenceIndicator({ reference, comparison, difference }: { readonly reference: number | null; readonly comparison: number | null; readonly difference: number | null }) {
  if (reference === null || comparison === null || difference === null) return <span className="text-muted-foreground">—</span>;
  const tolerance = Number.EPSILON * 8 * Math.max(1, Math.abs(reference), Math.abs(comparison));
  if (Math.abs(difference) <= tolerance) return <Equal aria-label="Equal" className="size-4 text-emerald-500" />;
  return difference > 0
    ? <ArrowUp aria-label="Reference higher" className="size-4 text-amber-500" />
    : <ArrowDown aria-label="Comparison higher" className="size-4 text-amber-500" />;
}

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
  const [pointer, setPointer] = useState<PointerSample | null>(null);
  const zrCleanup = useRef<(() => void) | null>(null);
  const clearPointer = useCallback(() => setPointer(null), []);
  useEffect(() => () => { zrCleanup.current?.(); }, []);
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
    () => createSignalChartOption(panels, domainStartSeconds, domainEndSeconds, chartHeight || 600, measuredWidth || 1024, initialVisibleFraction),
    [chartHeight, domainEndSeconds, domainStartSeconds, initialVisibleFraction, measuredWidth, panels],
  );

  return (
    <div
      ref={container}
      className="echarts-signal-chart relative h-full min-h-0"
      data-testid="signal-chart"
      role="group"
      aria-label={`Synchronized comparison of ${panels.length} signals. Use the mouse wheel or pinch to zoom, drag to pan, and the shared range slider to navigate all timelines.`}
    >
      {chartHeight > 0 && panels.map((panel, index) => {
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
      {chartHeight > 0 && panels.map((panel, index) => {
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
                {panel.unit ?? 'Unit unspecified'}
              </span>
            </div>
            {index === 0 && (
              <div className="hidden shrink-0 items-center gap-3 text-[10px] text-muted-foreground sm:flex" aria-label="Series legend">
                <span className="flex items-center gap-1.5"><span className="w-4 border-t border-dashed border-foreground/70" />Reference</span>
                <span className="flex items-center gap-1.5"><span className="w-4 border-t-2" style={{ borderColor: panel.color }} />Comparison</span>
              </div>
            )}
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
            requestInitialViewport(chart);
            zrCleanup.current?.();
            const zr = chart.getZr();
            const handleMove = (event: { offsetX?: number; offsetY?: number }) => {
              const x = event.offsetX;
              const y = event.offsetY;
              if (typeof x !== 'number' || typeof y !== 'number') return;
              const insidePlot = panels.some((_, index) => chart.containPixel({ gridIndex: index }, [x, y]));
              if (!insidePlot) { setPointer(null); return; }
              const converted = chart.convertFromPixel({ xAxisIndex: 0 }, x);
              const time = Number(converted);
              if (!Number.isFinite(time)) return;
              setPointer((current) => current && current.time === time && current.x === x && current.y === y
                ? current : { time, x, y });
            };
            zr.on('mousemove', handleMove);
            zr.on('globalout', clearPointer);
            zrCleanup.current = () => {
              zr.off('mousemove', handleMove);
              zr.off('globalout', clearPointer);
            };
          }}
          onEvents={{ datazoom: handleDataZoom }}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
      <Popover open={pointer !== null} modal={false}>
        <PopoverTrigger
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          className="pointer-events-none absolute size-px border-0 p-0 opacity-0"
          style={{ left: pointer?.x ?? -100, top: pointer?.y ?? -100 }}
        />
        {pointer && (
          <PopoverContent className="pointer-events-none w-[min(31rem,calc(100vw-2rem))] space-y-3 p-3 sm:p-4" side="right" align="start" sideOffset={12}>
            <div className="text-sm font-semibold tabular-nums">Time: {tooltipNumber.format(pointer.time)} s</div>
            {panels.filter((panel) => panel.visible).map((panel) => {
              const reference = sampleSeries(panel.reference, pointer.time);
              const comparison = sampleSeries(panel.comparison, pointer.time);
              const difference = reference !== null && comparison !== null ? reference - comparison : null;
              return (
                <section key={panel.id} className="space-y-1.5 border-t border-border/70 pt-2 first:border-0 first:pt-0">
                  <div className="flex items-baseline gap-1.5 text-sm"><strong>{panel.label}</strong><span className="text-muted-foreground">{panel.unit ?? ''}</span></div>
                  <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
                    <span className="text-muted-foreground">Reference</span><span className="tabular-nums">{formatTooltipValue(reference)}</span>
                    <span className="text-muted-foreground">Comparison</span><span className="tabular-nums">{formatTooltipValue(comparison)}</span>
                    <span className="text-muted-foreground">Difference (Ref − Comp)</span>
                    <span className="flex items-center justify-end gap-1.5 font-semibold tabular-nums"><DifferenceIndicator reference={reference} comparison={comparison} difference={difference} />{difference === null ? 'Unavailable' : formatTooltipValue(difference)}</span>
                  </div>
                </section>
              );
            })}
          </PopoverContent>
        )}
      </Popover>
    </div>
  );
}
