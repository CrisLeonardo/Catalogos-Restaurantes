'use client';

import * as React from 'react';
import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip';

import { cn } from '@/lib/utils';

const TooltipProvider = BaseTooltip.Provider;
const TooltipRoot = BaseTooltip.Root;
const TooltipTrigger = BaseTooltip.Trigger;

function TooltipContent({
  className,
  sideOffset = 8,
  children,
  ...props
}: React.ComponentProps<typeof BaseTooltip.Popup> &
  Pick<React.ComponentProps<typeof BaseTooltip.Positioner>, 'sideOffset' | 'side' | 'align'>) {
  return (
    <BaseTooltip.Portal>
      <BaseTooltip.Positioner sideOffset={sideOffset} className="z-[600]">
        <BaseTooltip.Popup
          data-slot="tooltip-content"
          className={cn(
            'rounded-adm-md border border-adm-border-2 bg-adm-overlay px-2.5 py-1.5 text-[12px] font-medium text-adm-text shadow-adm-md',
            'origin-[var(--transform-origin)] transition-[transform,opacity] data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0',
            className
          )}
          {...props}
        >
          {children}
        </BaseTooltip.Popup>
      </BaseTooltip.Positioner>
    </BaseTooltip.Portal>
  );
}

/** Envoltorio conveniente para el caso simple: `<Tooltip label="…"><button/></Tooltip>`. */
function Tooltip({
  label,
  children,
  ...rootProps
}: { label: React.ReactNode; children: React.ReactElement } & React.ComponentProps<
  typeof BaseTooltip.Root
>) {
  return (
    <TooltipRoot {...rootProps}>
      <TooltipTrigger render={children} />
      <TooltipContent>{label}</TooltipContent>
    </TooltipRoot>
  );
}

export { Tooltip, TooltipProvider, TooltipRoot, TooltipTrigger, TooltipContent };
