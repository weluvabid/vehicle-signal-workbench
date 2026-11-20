'use client';

import { Minus, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CHART_INTENTS } from '@/intents/chart-intents';
import { COMPARISON_LABELS as LABELS } from '@/constants/comparison-labels';

const ZOOM_LEVELS = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10, 15, 20] as const;
const ZOOM_FORMATTER = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

function applyZoom(factor: number) {
  window.dispatchEvent(new CustomEvent(CHART_INTENTS.SET_HORIZONTAL_ZOOM, { detail: { factor } }));
}

function getAdjacentZoom(factor: number, direction: -1 | 1): number {
  if (direction > 0) return ZOOM_LEVELS.find((level) => level > factor + 1e-6) ?? ZOOM_LEVELS[ZOOM_LEVELS.length - 1];
  return [...ZOOM_LEVELS].reverse().find((level) => level < factor - 1e-6) ?? ZOOM_LEVELS[0];
}

export function TimelineZoomControls() {
  const [factor, setFactor] = useState(1);

  useEffect(() => {
    const update = (event: Event) => {
      const next = (event as CustomEvent<{ factor?: number }>).detail?.factor;
      if (typeof next === 'number' && Number.isFinite(next)) setFactor(Math.max(1, Math.min(20, next)));
    };
    window.addEventListener(CHART_INTENTS.HORIZONTAL_ZOOM_CHANGED, update);
    return () => window.removeEventListener(CHART_INTENTS.HORIZONTAL_ZOOM_CHANGED, update);
  }, []);

  const set = (next: number) => {
    const bounded = Math.max(1, Math.min(20, next));
    setFactor(bounded);
    applyZoom(bounded);
  };

  return (
    <TooltipProvider>
      <div className="flex h-8 items-center gap-0.5 rounded-md border border-border/70 bg-background/95 px-1 shadow-sm backdrop-blur" role="group" aria-label={LABELS.timelineControls}>
        <Tooltip>
          <TooltipTrigger render={<Button type="button" size="icon-xs" variant="ghost" aria-label={LABELS.zoomOut} disabled={factor <= 1} onClick={() => set(getAdjacentZoom(factor, -1))} />}>
            <Minus />
          </TooltipTrigger>
          <TooltipContent>{LABELS.zoomOut}</TooltipContent>
        </Tooltip>
        <Popover>
          <PopoverTrigger className="h-7 min-w-11 rounded px-1.5 font-mono text-xs tabular-nums text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`${LABELS.zoomLevel}: ${ZOOM_FORMATTER.format(factor)}×`}>
            {ZOOM_FORMATTER.format(factor)}×
          </PopoverTrigger>
          <PopoverContent className="w-44 p-2" side="top" align="end">
            <p className="px-2 pb-2 text-xs font-medium text-muted-foreground">{LABELS.zoomLevel}</p>
            <div className="grid grid-cols-3 gap-1">
              {ZOOM_LEVELS.map((level) => (
                <Button key={level} type="button" size="sm" variant={Math.abs(factor - level) < 1e-6 ? 'secondary' : 'ghost'} onClick={() => set(level)}>
                  {ZOOM_FORMATTER.format(level)}×
                </Button>
              ))}
            </div>
            <Button className="mt-1 w-full" type="button" size="sm" variant="outline" onClick={() => set(1)}>{LABELS.fitAll}</Button>
          </PopoverContent>
        </Popover>
        <Tooltip>
          <TooltipTrigger render={<Button type="button" size="icon-xs" variant="ghost" aria-label={LABELS.zoomIn} disabled={factor >= 20} onClick={() => set(getAdjacentZoom(factor, 1))} />}>
            <Plus />
          </TooltipTrigger>
          <TooltipContent>{LABELS.zoomIn}</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
