'use client';

import { Activity, Plus } from 'lucide-react';
import { useAnimationFrameRate } from '@/features/comparison/performance/use-animation-frame-rate';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface LivePerformanceControlProps {
  readonly ingestion: string;
  readonly throughput: string;
  readonly memory: string;
  readonly rows: string;
}

function PerformanceReceipt({ ingestion, throughput, memory, rows }: LivePerformanceControlProps) {
  return (
    <div className="w-[min(20rem,calc(100vw-2rem))] space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em]">Performance receipt</h2>
        <Activity className="size-4 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="space-y-2.5 font-mono text-xs tabular-nums">
        <div className="flex items-baseline justify-between gap-4">
          <span className="font-sans text-muted-foreground">CSV ingestion</span>
          <span className="font-medium">{ingestion}</span>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <span className="font-sans text-muted-foreground">Typed-array memory</span>
          <span className="font-medium">{memory}</span>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <span className="font-sans text-muted-foreground">Timestamp rows</span>
          <span className="font-medium">{rows}</span>
        </div>
      </div>
      <div className="rounded-lg border bg-muted/35 px-3 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Throughput
        </p>
        <p className="mt-1 font-mono text-sm font-semibold tabular-nums">{throughput}</p>
      </div>
    </div>
  );
}

export function FrameRatePill() {
  const fps = useAnimationFrameRate();

  return (
    <div className="sticky top-[4.75rem] z-40 -mb-2 flex h-7 shrink-0 justify-end pointer-events-none">
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

export function LivePerformanceMonitor(props: LivePerformanceControlProps) {
  return (
    <div className="flex justify-end">
      <Popover>
        <PopoverTrigger
          aria-label="Show performance metrics"
          className="inline-flex h-9 items-center gap-2 rounded-full border border-border/80 bg-background/90 px-3 text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Activity className="size-4" aria-hidden="true" />
          <span aria-hidden="true" className="h-4 w-px bg-border" />
          <Plus className="size-4" aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent className="p-4" side="top" align="end">
          <PerformanceReceipt {...props} />
        </PopoverContent>
      </Popover>
    </div>
  );
}
