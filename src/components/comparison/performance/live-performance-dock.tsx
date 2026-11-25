'use client';

import { Activity } from 'lucide-react';
import { useAnimationFrameRate } from '@/features/comparison/performance/use-animation-frame-rate';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface PerformanceMetricsDisplay {
  readonly ingestion: string;
  readonly rowsPerSecond: string;
  readonly samplesPerSecond: string;
  readonly memory: string;
  readonly rows: string;
}

function PerformanceDetails({
  ingestion,
  rowsPerSecond,
  samplesPerSecond,
  memory,
  rows,
}: PerformanceMetricsDisplay) {
  return (
    <div className="w-full min-w-0 max-w-full space-y-3">
      <h2 className="text-sm font-semibold">Performance</h2>
      <dl className="space-y-2.5 text-sm tabular-nums">
        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <dt className="text-muted-foreground">CSV ingestion</dt>
          <dd className="max-w-full break-words text-right font-mono font-medium">{ingestion}</dd>
        </div>
        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <dt className="text-muted-foreground">Typed-array memory</dt>
          <dd className="max-w-full break-words text-right font-mono font-medium">{memory}</dd>
        </div>
        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <dt className="text-muted-foreground">Timestamp rows</dt>
          <dd className="max-w-full break-words text-right font-mono font-medium">{rows}</dd>
        </div>
      </dl>
      <div className="rounded-lg border bg-muted/35 px-3 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Throughput
        </p>
        <dl className="mt-2 space-y-2 text-sm tabular-nums">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">Rows per second</dt>
            <dd className="font-mono font-semibold">{rowsPerSecond}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">Samples per second</dt>
            <dd className="font-mono font-semibold">{samplesPerSecond}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

export function PerformancePopover(props: PerformanceMetricsDisplay) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label="Show performance metrics"
        className="inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Activity className="size-[18px]" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={8}
        positionerClassName="w-72 max-w-[calc(100vw-2rem)] min-w-0"
        className="box-border w-full min-w-0 max-w-full p-4"
      >
        <PerformanceDetails {...props} />
      </PopoverContent>
    </Popover>
  );
}

export function FrameRatePill() {
  const fps = useAnimationFrameRate();

  return (
    <div className="pointer-events-none sticky top-[4.75rem] z-40 -mb-2 flex h-7 shrink-0 justify-end">
      <div
        className="pointer-events-auto inline-flex h-7 items-center gap-1.5 rounded-full border border-border/80 bg-background/90 px-2.5 text-[11px] font-medium tabular-nums text-muted-foreground shadow-sm backdrop-blur"
        aria-label={`Frame rate: ${fps === null ? 'unavailable' : `${fps} frames per second`}`}
      >
        <Activity className="size-3 text-emerald-500" aria-hidden="true" />
        <span>{fps === null ? '—' : fps}</span>
        <span className="text-[9px] font-semibold uppercase tracking-wide">FPS</span>
      </div>
    </div>
  );
}
