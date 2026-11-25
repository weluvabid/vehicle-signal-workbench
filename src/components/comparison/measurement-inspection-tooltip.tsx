'use client';

import type { CSSProperties } from 'react';
import type { SignalChartPanel } from './signal-chart-types';
import { formatChartValue } from './chart-value-format';

interface MeasurementInspectionTooltipProps {
  readonly panels: readonly SignalChartPanel[];
  readonly time: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface Sample {
  readonly value: number | null;
  readonly interpolated: boolean;
}

function sampleAt(points: readonly (readonly [number, number | null])[], target: number): Sample {
  let low = 0;
  let high = points.length;

  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (points[middle][0] < target) low = middle + 1;
    else high = middle;
  }

  const right = points[low];
  if (right && right[0] === target) {
    return { value: right[1] !== null && Number.isFinite(right[1]) ? right[1] : null, interpolated: false };
  }

  const left = points[low - 1];
  if (!left || !right || left[1] === null || right[1] === null) return { value: null, interpolated: false };
  if (!Number.isFinite(left[1]) || !Number.isFinite(right[1])) return { value: null, interpolated: false };

  const span = right[0] - left[0];
  if (!(span > 0)) return { value: null, interpolated: false };

  return {
    value: left[1] + (right[1] - left[1]) * ((target - left[0]) / span),
    interpolated: true,
  };
}

function signed(value: number): string {
  return `${value > 0 ? '+' : ''}${formatChartValue(value)}`;
}

function MeasurementRow({ panel, time }: { panel: SignalChartPanel; time: number }) {
  const referenceSample = sampleAt(panel.reference, time);
  const comparisonSample = sampleAt(panel.comparison, time);
  const reference = referenceSample.value;
  const comparison = comparisonSample.value;
  const delta = reference !== null && comparison !== null ? comparison - reference : null;
  const isPercentage = panel.unit?.trim() === '%';
  const relativeDelta =
    delta !== null && reference !== null && reference !== 0
      ? (delta / Math.abs(reference)) * 100
      : null;

  return (
    <section className="space-y-2">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: panel.color }} />
          <h4 className="truncate text-xs font-semibold">{panel.label}</h4>
          {panel.unit && <span className="shrink-0 text-[10px] text-muted-foreground">({panel.unit})</span>}
        </div>
        <span className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">
          {referenceSample.interpolated || comparisonSample.interpolated ? 'Interpolated' : 'Sampled'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <p className="text-[10px] text-muted-foreground">Reference</p>
          <p className="truncate font-mono text-sm tabular-nums">
            {reference === null ? '—' : formatChartValue(reference)}
            {panel.unit ? <span className="ml-1 text-[10px] text-muted-foreground">{panel.unit}</span> : null}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] text-muted-foreground">Comparison</p>
          <p className="truncate font-mono text-sm tabular-nums">
            {comparison === null ? '—' : formatChartValue(comparison)}
            {panel.unit ? <span className="ml-1 text-[10px] text-muted-foreground">{panel.unit}</span> : null}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border/60 pt-2 text-[11px]">
        <span className="text-muted-foreground">Difference</span>
        <span className="font-mono tabular-nums">
          {delta === null
            ? 'Unavailable'
            : `${signed(delta)}${isPercentage ? ' pp' : panel.unit ? ` ${panel.unit}` : ''}`}
        </span>
        <span className="ml-auto text-muted-foreground">
          {relativeDelta === null ? 'Relative —' : `Relative ${signed(relativeDelta)}%`}
        </span>
      </div>
    </section>
  );
}

export function MeasurementInspectionTooltip({
  panels,
  time,
  x,
  y,
  width,
  height,
}: MeasurementInspectionTooltipProps) {
  const placeLeft = x > width / 2;
  const placeAbove = y > height / 2;
  const style: CSSProperties = {
    left: Math.max(8, Math.min(x, Math.max(8, width - 8))),
    top: Math.max(8, Math.min(y, Math.max(8, height - 8))),
    transform: `translate(${placeLeft ? '-100%' : '0'}, ${placeAbove ? '-100%' : '0'})`,
  };

  return (
    <aside
      className="pointer-events-none absolute z-30 w-[min(22rem,calc(100%_-_1rem))] max-h-[min(28rem,calc(100%_-_1rem))] overflow-y-auto rounded-lg border bg-popover/95 p-3 text-popover-foreground shadow-xl backdrop-blur-sm"
      style={style}
      aria-label="Measurement comparison details"
      data-testid="measurement-inspection-tooltip"
    >
      <div className="mb-3 flex items-center justify-between gap-3 border-b border-border/70 pb-2">
        <div>
          <p className="text-xs font-semibold">Measurement comparison</p>
          <p className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
            {formatChartValue(time)} s
          </p>
        </div>
        <span className="rounded-full border px-2 py-1 text-[10px] text-muted-foreground">
          Inspection
        </span>
      </div>
      <div className="space-y-3">
        {panels.map((panel, index) => (
          <div key={panel.id}>
            {index > 0 && <div className="mb-3 border-t border-border/70" />}
            <MeasurementRow panel={panel} time={time} />
          </div>
        ))}
      </div>
      <p className="mt-3 border-t border-border/70 pt-2 text-[10px] leading-relaxed text-muted-foreground">
        Status thresholds are not configured. Values and differences are shown without assigning
        an arbitrary severity.
      </p>
    </aside>
  );
}
