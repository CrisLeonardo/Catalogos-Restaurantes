'use client';

import * as React from 'react';
import { Tabs as BaseTabs } from '@base-ui/react/tabs';

import { cn } from '@/lib/utils';

const Tabs = BaseTabs.Root;

function TabsList({ className, ...props }: React.ComponentProps<typeof BaseTabs.List>) {
  return (
    <BaseTabs.List
      data-slot="tabs-list"
      className={cn(
        'relative inline-flex items-center gap-1 rounded-adm-lg border border-adm-border bg-adm-card p-1',
        className
      )}
      {...props}
    />
  );
}

function TabsTab({ className, ...props }: React.ComponentProps<typeof BaseTabs.Tab>) {
  return (
    <BaseTabs.Tab
      data-slot="tabs-tab"
      className={cn(
        'relative z-10 rounded-adm-md px-3.5 py-1.5 text-[13px] font-semibold text-adm-text-3 outline-none transition-colors',
        'data-[selected]:text-adm-text hover:text-adm-text-2',
        'focus-visible:ring-2 focus-visible:ring-adm-accent-500/40',
        className
      )}
      {...props}
    />
  );
}

function TabsIndicator({ className, ...props }: React.ComponentProps<typeof BaseTabs.Indicator>) {
  return (
    <BaseTabs.Indicator
      className={cn(
        'absolute rounded-adm-md bg-adm-bg-2 shadow-adm-xs transition-all duration-200',
        'top-[var(--active-tab-top)] left-[var(--active-tab-left)] h-[var(--active-tab-height)] w-[var(--active-tab-width)]',
        className
      )}
      {...props}
    />
  );
}

function TabsPanel({ className, ...props }: React.ComponentProps<typeof BaseTabs.Panel>) {
  return (
    <BaseTabs.Panel
      data-slot="tabs-panel"
      className={cn('mt-4 outline-none', className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTab, TabsIndicator, TabsPanel };
