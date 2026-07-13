'use client';

import * as React from 'react';
import { Dialog as BaseDialog } from '@base-ui/react/dialog';

import { cn } from '@/lib/utils';
import { Icon } from '@/components/icons';

const DialogRoot = BaseDialog.Root;
const DialogTrigger = BaseDialog.Trigger;
const DialogClose = BaseDialog.Close;

function DialogContent({
  className,
  children,
  showClose = true,
  ...props
}: React.ComponentProps<typeof BaseDialog.Popup> & { showClose?: boolean }) {
  return (
    <BaseDialog.Portal>
      <BaseDialog.Backdrop
        className={cn(
          'fixed inset-0 z-[400] bg-black/55 backdrop-blur-sm',
          'transition-opacity data-[starting-style]:opacity-0 data-[ending-style]:opacity-0'
        )}
      />
      <BaseDialog.Popup
        data-slot="dialog-content"
        className={cn(
          'fixed left-1/2 top-1/2 z-[401] w-[min(92vw,480px)] -translate-x-1/2 -translate-y-1/2',
          'rounded-adm-xl border border-adm-border-2 bg-adm-overlay p-6 shadow-adm-xl outline-none',
          'transition-[opacity,transform] data-[starting-style]:opacity-0 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[ending-style]:scale-95',
          className
        )}
        {...props}
      >
        {children}
        {showClose && (
          <BaseDialog.Close
            className="absolute right-4 top-4 grid size-8 place-items-center rounded-adm-md text-adm-text-3 outline-none transition-colors hover:bg-adm-card hover:text-adm-text focus-visible:ring-2 focus-visible:ring-adm-accent-500/40"
            aria-label="Cerrar"
          >
            <Icon name="x" size={16} />
          </BaseDialog.Close>
        )}
      </BaseDialog.Popup>
    </BaseDialog.Portal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('mb-4 flex flex-col gap-1 pr-6', className)} {...props} />;
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof BaseDialog.Title>) {
  return (
    <BaseDialog.Title
      className={cn('text-[17px] font-bold text-adm-text', className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof BaseDialog.Description>) {
  return (
    <BaseDialog.Description
      className={cn('text-[13px] text-adm-text-3', className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('mt-5 flex items-center justify-end gap-2.5', className)}
      {...props}
    />
  );
}

export {
  DialogRoot as Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
};
