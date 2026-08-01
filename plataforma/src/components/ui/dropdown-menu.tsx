'use client';

import * as React from 'react';
import { Menu as BaseMenu } from '@base-ui/react/menu';
import { Separator as BaseSeparator } from '@base-ui/react/separator';

import { cn } from '@/lib/utils';

const DropdownMenu = BaseMenu.Root;
const DropdownMenuTrigger = BaseMenu.Trigger;
const DropdownMenuGroup = BaseMenu.Group;
const DropdownMenuGroupLabel = BaseMenu.GroupLabel;

function DropdownMenuContent({
  className,
  sideOffset = 6,
  align = 'start',
  children,
  ...props
}: React.ComponentProps<typeof BaseMenu.Popup> &
  Pick<React.ComponentProps<typeof BaseMenu.Positioner>, 'sideOffset' | 'align' | 'side'>) {
  return (
    <BaseMenu.Portal>
      <BaseMenu.Positioner sideOffset={sideOffset} align={align} className="z-[500] outline-none">
        <BaseMenu.Popup
          data-slot="dropdown-menu-content"
          className={cn(
            'min-w-[180px] rounded-adm-lg border border-adm-border-2 bg-adm-overlay p-1 shadow-adm-lg outline-none',
            'origin-[var(--transform-origin)] transition-[transform,opacity] data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0',
            className
          )}
          {...props}
        >
          {children}
        </BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  );
}

function DropdownMenuItem({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<typeof BaseMenu.Item> & { variant?: 'default' | 'destructive' }) {
  return (
    <BaseMenu.Item
      data-slot="dropdown-menu-item"
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-adm-md px-3 py-2 text-[13px] font-medium text-adm-text outline-none transition-colors',
        'data-[highlighted]:bg-adm-accent-500/12 data-[highlighted]:text-adm-accent-ink',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
        variant === 'destructive' && 'text-adm-danger data-[highlighted]:bg-adm-danger/12 data-[highlighted]:text-adm-danger',
        className
      )}
      {...props}
    />
  );
}

function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof BaseSeparator>) {
  return (
    <BaseSeparator
      className={cn('my-1 h-px bg-adm-border', className)}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuGroupLabel,
  DropdownMenuSeparator,
};
