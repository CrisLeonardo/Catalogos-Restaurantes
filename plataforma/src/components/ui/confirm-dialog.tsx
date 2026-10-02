'use client';

import * as React from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * Pregunta de confirmación dentro del panel — reemplaza a `window.confirm()`,
 * que sacaba una caja gris del sistema operativo con el dominio arriba
 * («distleogin.com dice…»), en inglés según el navegador, y que en el
 * teléfono parece un aviso de otra app (auditoría 2026-10-02, T-16).
 *
 * Uso con una función:
 *   const { confirm, dialog } = useConfirm();
 *   if (!(await confirm({ title: '¿Eliminar el cupón?', destructive: true }))) return;
 *   …
 *   return <>{…}{dialog}</>;
 *
 * Uso con un `<form action={…}>` (server action):
 *   <form action={remove} onSubmit={confirmSubmit({ title: '¿Quitar a este miembro?' })}>
 *   Se detiene el envío, se pregunta y, si dicen que sí, se vuelve a enviar
 *   el mismo formulario con el mismo botón (conserva `name`/`value`).
 */
export type ConfirmOptions = {
  title: string;
  description?: string;
  /** Texto del botón que confirma. Por defecto «Eliminar» si es destructiva, si no «Aceptar». */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Pinta el botón de confirmar en rojo. Por defecto `true`: casi todas son para borrar. */
  destructive?: boolean;
};

export function useConfirm() {
  const [open, setOpen] = React.useState(false);
  // Las opciones viven aparte de `open` para que el texto no desaparezca
  // mientras el diálogo se desvanece al cerrarse.
  const [opts, setOpts] = React.useState<ConfirmOptions | null>(null);
  const resolver = React.useRef<((ok: boolean) => void) | null>(null);
  const cancelRef = React.useRef<HTMLButtonElement>(null);

  const settle = React.useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOpen(false);
  }, []);

  const confirm = React.useCallback((next: ConfirmOptions) => {
    // Si quedaba una pregunta abierta, cuenta como «no».
    resolver.current?.(false);
    setOpts(next);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const confirmSubmit = React.useCallback(
    (next: ConfirmOptions) => (e: React.FormEvent<HTMLFormElement>) => {
      const form = e.currentTarget;
      if (form.dataset.confirmed === '1') {
        delete form.dataset.confirmed;
        return;
      }
      e.preventDefault();
      const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
      void confirm(next).then((ok) => {
        if (!ok || !form.isConnected) return;
        form.dataset.confirmed = '1';
        form.requestSubmit(submitter && submitter.form === form ? submitter : undefined);
      });
    },
    [confirm]
  );

  const destructive = opts?.destructive ?? true;
  const dialog = (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) settle(false);
      }}
    >
      <DialogContent
        showClose={false}
        initialFocus={cancelRef}
        role="alertdialog"
        className="w-[min(92vw,400px)] p-5"
      >
        <DialogHeader className="mb-0 pr-0">
          <DialogTitle className="text-[16px] leading-snug">{opts?.title}</DialogTitle>
          {opts?.description && (
            <DialogDescription className="text-[13.5px] leading-relaxed text-adm-text-2">
              {opts.description}
            </DialogDescription>
          )}
        </DialogHeader>
        <DialogFooter className="mt-5 max-sm:[&>*]:flex-1">
          <Button ref={cancelRef} variant="secondary" onClick={() => settle(false)}>
            {opts?.cancelLabel ?? 'Cancelar'}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'primary'}
            onClick={() => settle(true)}
          >
            {opts?.confirmLabel ?? (destructive ? 'Eliminar' : 'Aceptar')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { confirm, confirmSubmit, dialog };
}
