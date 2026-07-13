'use client';

import * as React from 'react';
import { Drawer as BaseDrawer } from '@base-ui/react/drawer';

import { cn } from '@/lib/utils';
import { Icon } from '@/components/icons';

/**
 * Hoja (Base UI Drawer) — reemplaza el patrón "waiter-sheet" (scrim + panel
 * pegado abajo en móvil / centrado en escritorio) que se copiaba a mano en
 * cada componente. Con swipe-to-dismiss real en móvil.
 */
const SheetRoot = BaseDrawer.Root;
const SheetTrigger = BaseDrawer.Trigger;
const SheetClose = BaseDrawer.Close;

function SheetContent({
  className,
  children,
  showClose = true,
  ...props
}: React.ComponentProps<typeof BaseDrawer.Popup> & { showClose?: boolean }) {
  return (
    <BaseDrawer.Portal>
      <BaseDrawer.Backdrop
        className={cn(
          'fixed inset-0 z-[500] bg-black/55 backdrop-blur-sm',
          'transition-opacity data-[starting-style]:opacity-0 data-[ending-style]:opacity-0'
        )}
      />
      <BaseDrawer.Viewport className="fixed inset-0 z-[501] flex items-end justify-center sm:items-center sm:p-6">
        <BaseDrawer.Popup
          data-slot="sheet-content"
          className={cn(
            'relative flex max-h-[88dvh] w-full max-w-[460px] flex-col overflow-hidden',
            'rounded-t-[20px] border border-adm-border-2 bg-adm-overlay shadow-adm-xl outline-none',
            'sm:max-h-[86dvh] sm:rounded-adm-2xl',
            'transition-transform data-[starting-style]:translate-y-full data-[ending-style]:translate-y-full sm:data-[starting-style]:translate-y-4 sm:data-[starting-style]:opacity-0 sm:data-[ending-style]:opacity-0',
            className
          )}
          {...props}
        >
          <div className="mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full bg-adm-border-2 sm:hidden" aria-hidden />
          {showClose && (
            <BaseDrawer.Close
              className="absolute right-4 top-4 z-10 hidden size-8 place-items-center rounded-adm-md text-adm-text-3 outline-none transition-colors hover:bg-adm-card hover:text-adm-text sm:grid"
              aria-label="Cerrar"
            >
              <Icon name="x" size={16} />
            </BaseDrawer.Close>
          )}
          <div className="flex-1 overflow-y-auto">{children}</div>
        </BaseDrawer.Popup>
      </BaseDrawer.Viewport>
    </BaseDrawer.Portal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1 px-5 pb-3 pt-4 sm:pt-5', className)} {...props} />;
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof BaseDrawer.Title>) {
  return (
    <BaseDrawer.Title className={cn('text-[16px] font-bold text-adm-text', className)} {...props} />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof BaseDrawer.Description>) {
  return (
    <BaseDrawer.Description className={cn('text-[13px] text-adm-text-3', className)} {...props} />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex items-center justify-end gap-2.5 border-t border-adm-border px-5 py-4',
        className
      )}
      {...props}
    />
  );
}

export {
  SheetRoot as Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
};
