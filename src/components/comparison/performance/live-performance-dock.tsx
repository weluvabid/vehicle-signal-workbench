import { COMPARISON_LABELS as LABELS } from '@/constants/comparison-labels';

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
    <section className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-background/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_32px_rgb(0_0_0/0.18)] backdrop-blur-xl" aria-label={LABELS.livePerformance} data-testid="live-performance-dock">
      <div className="w-full px-5 py-3 sm:px-8 sm:py-4 lg:px-10">
        <h2 className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">{LABELS.livePerformance}</h2>
        <div className="-mx-5 overflow-x-auto overscroll-x-contain px-5 [scrollbar-width:thin] sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10">
          <div className="flex min-w-max items-start justify-between gap-8 sm:min-w-0 sm:gap-6 lg:gap-10">
            {items.map((item) => (
              <div key={item.label} className="min-w-[10.5rem] flex-1 sm:min-w-0">
                <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground sm:text-[11px]">{item.label}</p>
                <p className="mt-0.5 truncate font-mono text-base font-medium tabular-nums sm:text-xl">{item.value}{item.unit && <span className="ml-1 text-xs font-normal text-muted-foreground">{item.unit}</span>}</p>
                <p className="mt-0.5 truncate text-[10px] text-muted-foreground/75 sm:text-[11px]">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
