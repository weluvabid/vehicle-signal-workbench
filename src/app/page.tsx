import Link from 'next/link';
import { Activity, HardDrive } from 'lucide-react';
import { ComparisonWorkspace } from '@/components/comparison/comparison-workspace';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col px-4 pb-8 sm:px-6 lg:px-8">
      <header className="flex h-16 shrink-0 items-center justify-between border-b">
        <Link className="inline-flex items-center gap-3 text-sm font-semibold tracking-tight" href="/" aria-label="Vehicle Signal Workbench home">
          <span className="grid size-8 place-items-center rounded-md border bg-card"><Activity className="size-4" /></span>
          Vehicle Signal Workbench
        </Link>
        <span className="inline-flex items-center gap-2 text-xs text-muted-foreground"><HardDrive className="size-3.5" /> LOCAL · IN-BROWSER</span>
      </header>
      <section className="flex flex-wrap items-end justify-between gap-4 py-6 sm:py-8" aria-labelledby="page-title">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Measurement analysis</p>
          <h1 id="page-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">Compare vehicle runs</h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">Compare baseline and candidate measurements, inspect synchronized signals, and quantify differences across matched channels.</p>
        </div>
        <p className="text-xs text-muted-foreground">Data remains in this browser session</p>
      </section>
      <ComparisonWorkspace />
      <footer className="mt-auto flex flex-wrap justify-between gap-3 border-t pt-5 text-xs text-muted-foreground">
        <span>VEHICLE SIGNAL WORKBENCH</span><span>Client-side measurement analysis</span>
      </footer>
    </main>
  );
}
