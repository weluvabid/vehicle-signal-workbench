'use client';

import * as React from 'react';
import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip';
import { cn } from '@/lib/utils';

function TooltipProvider({ children, ...props }: TooltipPrimitive.Provider.Props) {
  return <TooltipPrimitive.Provider delay={350} closeDelay={100} {...props}>{children}</TooltipPrimitive.Provider>;
}

function Tooltip({ children, ...props }: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root {...props}>{children}</TooltipPrimitive.Root>;
}

function TooltipTrigger(props: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger {...props} />;
}

function TooltipContent({ className, side = 'top', sideOffset = 6, ...props }: TooltipPrimitive.Popup.Props & { side?: 'top' | 'right' | 'bottom' | 'left'; sideOffset?: number }) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner side={side} sideOffset={sideOffset} className="z-[100]">
        <TooltipPrimitive.Popup className={cn('rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md', className)} {...props} />
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

export { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent };
