'use client';

import * as React from 'react';
import { Toast as BaseToast } from '@base-ui/react/toast';

import { cn } from '@/lib/utils';
import { Icon } from '@/components/icons';

/* `useToastManager` solo se re-exporta como tipo en el índice del paquete
   (bug/particularidad de sus .d.ts) — el valor en runtime sí vive en el
   namespace `Toast`, así que se toma de ahí en vez de un named import. */
const useToastManager = BaseToast.useToastManager;

/**
 * Sistema de notificaciones (Base UI Toast) — reemplaza los toasts locales
 * ad-hoc (useState + setTimeout, reimplementados por componente, ej.
 * orders-panel.tsx) por uno solo, reutilizable en todo el panel.
 *
 * Uso:
 *   <ToastProvider><...admin shell...><Toaster /></ToastProvider>
 *   const { add } = useToastManager();
 *   add({ title: 'Guardado', type: 'success' });
 */
const ToastProvider = BaseToast.Provider;

const TOAST_ICON: Record<string, { name: string; className: string }> = {
  success: { name: 'checkCircle', className: 'text-adm-ok' },
  error: { name: 'alertCircle', className: 'text-adm-danger' },
  warning: { name: 'alertCircle', className: 'text-adm-warn' },
  info: { name: 'bell', className: 'text-adm-info' },
};

function ToastList() {
  const { toasts } = useToastManager();
  return toasts.map((toast) => {
    const meta = TOAST_ICON[toast.type ?? 'info'] ?? TOAST_ICON.info;
    return (
      <BaseToast.Root
        key={toast.id}
        toast={toast}
        data-slot="toast"
        className={cn(
          'group/toast pointer-events-auto flex items-start gap-2.5 rounded-adm-lg border border-adm-border-2 bg-adm-overlay p-3.5 pr-4 shadow-adm-lg',
          'w-[min(92vw,360px)] transition-all',
          'data-[starting-style]:translate-y-2 data-[starting-style]:opacity-0',
          'data-[ending-style]:opacity-0',
          'data-[swipe-direction=right]:data-[ending-style]:translate-x-full',
          'data-[swipe-direction=left]:data-[ending-style]:-translate-x-full'
        )}
      >
        <Icon name={meta.name} size={18} className={cn('mt-0.5 shrink-0', meta.className)} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <BaseToast.Title className="text-[13px] font-semibold text-adm-text" />
          <BaseToast.Description className="text-[12.5px] text-adm-text-3" />
        </div>
        <BaseToast.Close
          className="shrink-0 rounded-adm-md p-1 text-adm-text-4 outline-none transition-colors hover:bg-adm-card hover:text-adm-text"
          aria-label="Cerrar notificación"
        >
          <Icon name="x" size={14} />
        </BaseToast.Close>
      </BaseToast.Root>
    );
  });
}

/** Monta esto una sola vez dentro del `<ToastProvider>` (p. ej. en el shell del admin). */
function Toaster() {
  return (
    <BaseToast.Portal>
      <BaseToast.Viewport className="fixed bottom-4 right-4 z-[700] flex flex-col gap-2 outline-none sm:bottom-6 sm:right-6">
        <ToastList />
      </BaseToast.Viewport>
    </BaseToast.Portal>
  );
}

export { ToastProvider, Toaster, useToastManager };
