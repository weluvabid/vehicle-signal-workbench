'use client';

import { Minus, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CHART_INTENTS } from '@/intents/chart-intents';
import { COMPARISON_LABELS as LABELS } from '@/constants/comparison-labels';

const ZOOM_PRESETS = [1, 2, 5, 10, 20] as const;

function applyZoom(factor: number) {
  window.dispatchEvent(new CustomEvent(CHART_INTENTS.SET_HORIZONTAL_ZOOM, { detail: { factor } }));
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
      <div className="flex items-center gap-1" role="group" aria-label={LABELS.timelineControls}>
        <Tooltip><TooltipTrigger render={<Button type="button" size="icon-sm" variant="ghost" aria-label={LABELS.zoomOut} disabled={factor <= 1} onClick={() => set(factor / 2)} />}><Minus /></TooltipTrigger><TooltipContent>{LABELS.zoomOut}</TooltipContent></Tooltip>
        <Popover>
          <PopoverTrigger className="h-8 min-w-12 rounded-md px-2 font-mono text-xs tabular-nums text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`${LABELS.zoomLevel}: ${factor}×`}>{factor}×</PopoverTrigger>
          <PopoverContent className="w-40 p-2" side="top" align="center">
            <p className="px-2 pb-2 text-xs font-medium text-muted-foreground">{LABELS.zoomLevel}</p>
            <div className="grid grid-cols-2 gap-1">
              {ZOOM_PRESETS.map((preset) => <Button key={preset} type="button" size="sm" variant={factor === preset ? 'secondary' : 'ghost'} onClick={() => set(preset)}>{preset}×</Button>)}
              <Button type="button" size="sm" variant="ghost" onClick={() => set(1)}>{LABELS.fitAll}</Button>
            </div>
          </PopoverContent>
        </Popover>
        <Tooltip><TooltipTrigger render={<Button type="button" size="icon-sm" variant="ghost" aria-label={LABELS.zoomIn} disabled={factor >= 20} onClick={() => set(factor * 2)} />}><Plus /></TooltipTrigger><TooltipContent>{LABELS.zoomIn}</TooltipContent></Tooltip>
        <Button type="button" size="sm" variant="outline" className="h-8 px-2 text-xs" onClick={() => set(1)}>{LABELS.fitAll}</Button>
      </div>
    </TooltipProvider>
  );
}
