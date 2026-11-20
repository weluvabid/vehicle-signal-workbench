import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { CircleHelp, Github, Plus } from 'lucide-react';
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
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '?' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (
        target.isContentEditable ||
        target.closest('input, textarea, select, [role="textbox"], [contenteditable="true"]')
      )) return;
      event.preventDefault();
      setHelpOpen(true);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
        <Tooltip>
          <TooltipTrigger render={<Button type="button" size="icon" variant="ghost" className="size-9 rounded-full" onClick={onNewWorkload} aria-label="New workload" aria-keyshortcuts="N" />}>
            <Plus className="size-[18px]" />
          </TooltipTrigger>
          <TooltipContent>New workload</TooltipContent>
        </Tooltip>
        <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
          <Tooltip>
            <TooltipTrigger render={<DialogTrigger render={<Button type="button" size="icon" variant="ghost" className="size-9 rounded-full" aria-label="Chart shortcuts" aria-keyshortcuts="?"><CircleHelp className="size-[18px]" /></Button>} />} />
            <TooltipContent>Keyboard shortcuts and help</TooltipContent>
          </Tooltip>
          <DialogContent className="max-h-[min(80dvh,36rem)] overflow-y-auto sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Keyboard shortcuts &amp; help</DialogTitle>
              <DialogDescription>Navigate and inspect vehicle signals.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Keyboard</h3>
                {[
                  ['?', 'Open this help'],
                  ['N', 'Open a new workload'],
                  ['0', 'Reset timeline zoom'],
                  ['+ / =', 'Zoom timeline in'],
                  ['−', 'Zoom timeline out'],
                ].map(([key, description]) => (
                  <div key={key} className="flex items-center justify-between gap-3 border-b border-border/60 pb-2 last:border-0">
                    <span className="text-xs text-muted-foreground">{description}</span>
                    <kbd className="shrink-0 rounded-md border bg-muted px-2 py-1 font-mono text-[11px]">{key}</kbd>
                  </div>
                ))}
              </section>
              <section className="space-y-2 border-t pt-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mouse &amp; trackpad</h3>
                {[
                  ['Scroll', 'Scroll vertically through the workspace.'],
                  ['⌘ / Ctrl + scroll', 'Zoom the timeline around the pointer.'],
                  ['Shift + scroll', 'Pan horizontally through time.'],
                  ['Drag', 'Pan the timeline.'],
                  ['Zoom controls', 'Choose a zoom preset or fit the full timeline.'],
                  ['Alt + scroll', 'Zoom the signal vertically around the pointer.'],
                ].map(([key, description]) => (
                  <div key={key} className="flex flex-col gap-1 border-b border-border/60 pb-2 last:border-0">
                    <span className="font-medium">{key}</span>
                    <span className="text-xs text-muted-foreground">{description}</span>
                  </div>
                ))}
              </section>
            </div>
          </DialogContent>
        </Dialog>
        <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
        <Tooltip>
          <TooltipTrigger render={<a href="https://github.com/weluvabid/vehicle-signal-workbench" target="_blank" rel="noreferrer" aria-label="GitHub repository" className="inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" />}>
            <Github className="size-[17px]" />
          </TooltipTrigger>
          <TooltipContent>View source on GitHub</TooltipContent>
        </Tooltip>
      </div>
    </header>
    </TooltipProvider>
  );
}
