import Image from 'next/image';
import Link from 'next/link';
import { CircleHelp, Plus } from 'lucide-react';
import { SiGithub } from '@icons-pack/react-simple-icons';
import ghostMark from '../../../brand/me/brand/mark.svg';
import { Button } from '@/components/ui/button';
import {
  PerformancePopover,
  type PerformanceMetricsDisplay,
} from '@/components/comparison/performance/live-performance-dock';
import { COMPARISON_LABELS } from '@/constants/comparison-labels';
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
  helpOpen: boolean;
  onHelpOpenChange: (open: boolean) => void;
  performance: PerformanceMetricsDisplay | null;
}

export function SiteHeader({
  onNewWorkload,
  helpOpen,
  onHelpOpenChange,
  performance,
}: SiteHeaderProps) {
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
          {performance && (
            <>
              <PerformancePopover {...performance} />
              <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
            </>
          )}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-9 rounded-full"
                  onClick={onNewWorkload}
                  aria-label="New workload"
                  aria-keyshortcuts="N"
                />
              }
            >
              <Plus className="size-[18px]" />
            </TooltipTrigger>
            <TooltipContent>New workload</TooltipContent>
          </Tooltip>
          <Dialog open={helpOpen} onOpenChange={onHelpOpenChange}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <DialogTrigger
                    render={
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-9 rounded-full"
                        aria-label="Chart shortcuts"
                        aria-keyshortcuts="?"
                      >
                        <CircleHelp className="size-[18px]" />
                      </Button>
                    }
                  />
                }
              />
              <TooltipContent>Keyboard shortcuts and help</TooltipContent>
            </Tooltip>
            <DialogContent className="max-h-[min(80dvh,36rem)] overflow-y-auto sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{COMPARISON_LABELS.shortcutHelp}</DialogTitle>
                <DialogDescription>{COMPARISON_LABELS.shortcutHelpDescription}</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <section className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {COMPARISON_LABELS.shortcutSectionKeyboard}
                  </h3>
                  {[
                    ['?', COMPARISON_LABELS.shortcutOpenHelp],
                    ['N', COMPARISON_LABELS.shortcutNewWorkload],
                    ['0', COMPARISON_LABELS.shortcutResetZoom],
                    ['+ / =', COMPARISON_LABELS.shortcutZoomIn],
                    ['−', COMPARISON_LABELS.shortcutZoomOut],
                  ].map(([key, description]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-3 border-b border-border/60 pb-2 last:border-0"
                    >
                      <span className="text-xs text-muted-foreground">{description}</span>
                      <kbd className="shrink-0 rounded-md border bg-muted px-2 py-1 font-mono text-[11px]">
                        {key}
                      </kbd>
                    </div>
                  ))}
                </section>
                <section className="space-y-2 border-t pt-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {COMPARISON_LABELS.shortcutSectionPointer}
                  </h3>
                  {[
                    ['Scroll', COMPARISON_LABELS.shortcutScroll],
                    ['⌘ / Ctrl + scroll', COMPARISON_LABELS.shortcutModifierScroll],
                    ['Shift + scroll', COMPARISON_LABELS.shortcutShiftScroll],
                    ['Drag', COMPARISON_LABELS.shortcutDrag],
                    ['Zoom controls', COMPARISON_LABELS.shortcutZoomControls],
                    ['Alt + scroll', COMPARISON_LABELS.shortcutAltScroll],
                  ].map(([key, description]) => (
                    <div
                      key={key}
                      className="flex flex-col gap-1 border-b border-border/60 pb-2 last:border-0"
                    >
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
            <TooltipTrigger
              render={
                <a
                  href="https://github.com/weluvabid/vehicle-signal-workbench"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="GitHub repository"
                  className="inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                />
              }
            >
              <SiGithub className="size-[17px]" aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent>View source on GitHub</TooltipContent>
          </Tooltip>
        </div>
      </header>
    </TooltipProvider>
  );
}
