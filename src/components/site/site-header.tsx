import { CHART_INTENTS } from '@/intents/chart-intents';
import Image from 'next/image';
import Link from 'next/link';
import { CircleHelp, Plus, RotateCcw } from 'lucide-react';
import ghostMark from '../../../brand/me/brand/mark.svg';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface SiteHeaderProps {
  onNewWorkload: () => void;
}

export function SiteHeader({ onNewWorkload }: SiteHeaderProps) {
  return (
    <TooltipProvider>
    <header className="sticky top-3 z-50 isolate mx-auto mt-3 flex w-full shrink-0 items-center justify-between gap-3 rounded-full border border-foreground/15 bg-background/80 px-3 py-2 shadow-lg shadow-black/20 backdrop-blur-[10px] sm:px-4">
      <Link
        href="/"
        aria-label="Vehicle Signal Workbench home"
        className="grid size-9 shrink-0 place-items-center rounded-full transition-opacity hover:opacity-80"
      >
        <Image src={ghostMark} alt="" priority className="size-8 object-contain" />
      </Link>

      <div className="flex items-center gap-1">
        <Tooltip><TooltipTrigger render={<Button type="button" size="icon" variant="ghost" className="size-9 rounded-full" onClick={onNewWorkload} aria-label="New workload" />}><Plus className="size-[18px]" /></TooltipTrigger><TooltipContent>New workload</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger render={<Button type="button" size="icon" variant="ghost" className="size-9 rounded-full" onClick={() => window.dispatchEvent(new Event(CHART_INTENTS.RESET_ZOOM))} aria-label="Reset chart zoom" />}><RotateCcw className="size-[17px]" /></TooltipTrigger><TooltipContent>Reset workspace zoom</TooltipContent></Tooltip>
        <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
        <Tooltip><TooltipTrigger render={<a href="https://github.com/weluvabid/vehicle-signal-workbench" target="_blank" rel="noreferrer" aria-label="GitHub repository" className="inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" />}><svg viewBox="0 0 24 24" className="size-[17px] fill-current" aria-hidden="true"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645.24.12 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22.015 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" /></svg></TooltipTrigger><TooltipContent>View source on GitHub</TooltipContent></Tooltip>
        <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
        <Dialog>
          <Tooltip>
            <TooltipTrigger render={<DialogTrigger render={<Button type="button" size="icon" variant="ghost" className="size-9 rounded-full" aria-label="Chart shortcuts"><CircleHelp className="size-[18px]" /></Button>} />} />
            <TooltipContent>Keyboard shortcuts and help</TooltipContent>
          </Tooltip>
          <DialogContent className="max-h-[min(80dvh,36rem)] overflow-y-auto sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Chart shortcuts</DialogTitle>
              <DialogDescription>Navigate and inspect vehicle signals.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              {[
                ['Scroll', 'Scroll vertically through the workspace.'],
                ['⌘ / Ctrl + scroll', 'Zoom the timeline around the pointer.'],
                ['Shift + scroll', 'Pan horizontally through time.'],
                ['Drag', 'Pan the timeline.'],
                ['Zoom controls', 'Use the timeline controls to zoom in, zoom out, choose a preset or fit all.'],
                ['Alt + scroll', 'Zoom the signal vertically around the pointer.'],
              ].map(([key, description]) => (
                <div key={key} className="flex flex-col gap-1 border-b border-border/60 pb-2 last:border-0">
                  <span className="font-medium">{key}</span>
                  <span className="text-xs text-muted-foreground">{description}</span>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </header>
    </TooltipProvider>
  );
}
