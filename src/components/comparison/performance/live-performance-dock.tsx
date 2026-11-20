import { COMPARISON_LABELS as LABELS } from '@/constants/comparison-labels';
import { useAnimationFrameRate } from '@/features/comparison/performance/use-animation-frame-rate';

interface LivePerformanceDockProps {
  readonly fps: number | null;
  readonly ingestion: string;
  readonly throughput: string;
  readonly memory: string;
  readonly rows: string;
}

export function LivePerformanceDock({ fps, ingestion, throughput, memory, rows }: LivePerformanceDockProps) {
  const items = [
    { label: LABELS.frameRate, value: fps === null ? '—' : String(fps), unit: 'FPS', detail: LABELS.liveRendering },
    { label: LABELS.csvIngestion, value: ingestion, unit: '', detail: throughput },
    { label: LABELS.typedArrayMemory, value: memory, unit: '', detail: LABELS.retainedBuffers },
    { label: LABELS.timestampRows, value: rows, unit: '', detail: LABELS.bothRecordings },
  ];

  return (
    <section className="fixed inset-x-0 bottom-0 z-40 box-border w-full max-w-full overflow-x-clip border-t border-border/80 bg-background/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_32px_rgb(0_0_0/0.18)] backdrop-blur-xl" aria-label={LABELS.livePerformance} data-testid="live-performance-dock">
      <div className="mx-auto box-border w-full min-w-0 max-w-[1800px] px-3 py-3 sm:px-5 sm:py-4 lg:px-6">
        <h2 className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">{LABELS.livePerformance}</h2>
        <div className="grid w-full min-w-0 grid-cols-[repeat(2,minmax(0,1fr))] items-start gap-x-4 gap-y-3 md:grid-cols-[repeat(4,minmax(0,1fr))] md:gap-6 lg:gap-10">
            {items.map((item) => (
              <div key={item.label} className="min-w-0">
                <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground sm:text-[11px]">{item.label}</p>
                <p className="mt-0.5 flex min-w-0 items-baseline gap-1 overflow-hidden font-mono text-base font-medium tabular-nums sm:text-xl"><span className="min-w-0 truncate">{item.value}</span>{item.unit && <span className="shrink-0 text-xs font-normal text-muted-foreground">{item.unit}</span>}</p>
                <p className="mt-0.5 truncate text-[10px] text-muted-foreground/75 sm:text-[11px]">{item.detail}</p>
              </div>
            ))}
        </div>
      </div>
    </section>
  );
}

/** Keeps animation-frame state local to the dock instead of the chart workspace. */
export function LivePerformanceMonitor(props: Omit<LivePerformanceDockProps, 'fps'>) {
  const fps = useAnimationFrameRate();
  return <LivePerformanceDock {...props} fps={fps} />;
}
