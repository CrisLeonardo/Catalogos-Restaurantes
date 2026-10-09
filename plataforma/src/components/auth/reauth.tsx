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
import GoogleStaffButton from '@/components/auth/google-staff-button';
import { confirmarIdentidad, necesitoReautenticar, type ConfirmarState } from '@/lib/actions/reauth';
import { REAUTH_VENTANA_MS } from '@/lib/auth/reauth-policy';

/**
 * «Confirma que eres tú» antes de algo delicado (ACC-09).
 *
 * Uso con una función (descargar el respaldo, exportar clientes):
 *   const { asegurar, dialog } = useReauth();
 *   if (!(await asegurar())) return;
 *   …
 *   return <>{…}{dialog}</>;
 *
 * Uso con un `<form action={…}>`:
 *   <form action={accion} onSubmit={reauthSubmit()}>
 *   …o con pregunta previa: onSubmit={reauthSubmit(() => confirm({ title: '¿Quitar…?' }))}
 *   Se detiene el envío, se pregunta al servidor si hace falta y, si hace,
 *   se pide la contraseña; luego se vuelve a enviar el MISMO formulario con
 *   el mismo botón. Se pregunta ANTES de enviar porque un formulario ya
 *   enviado se vacía (React 19) y no se podría reenviar igual.
 *
 * En un modal, `{dialog}` va DENTRO de su DialogContent (como useConfirm).
 */
export function useReauth() {
  const [open, setOpen] = React.useState(false);
  const [conGoogle, setConGoogle] = React.useState(false);
  const resolver = React.useRef<((ok: boolean) => void) | null>(null);

  const settle = React.useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOpen(false);
  }, []);

  /** true si ya se puede seguir (no hacía falta, o acaba de confirmar). */
  const asegurar = React.useCallback(async (): Promise<boolean> => {
    let estado;
    try {
      estado = await necesitoReautenticar();
    } catch {
      // Sin red: que siga; la acción lo comprueba de todos modos y contestará.
      return true;
    }
    if (estado.reciente) return true;
    resolver.current?.(false);
    setConGoogle(estado.conGoogle);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  /**
   * Para `onSubmit`: `reauthSubmit()` a secas, o `reauthSubmit(() => confirm({…}))`
   * si el formulario además pregunta «¿seguro?». Las dos cosas van en UNA
   * sola pasada (primero la pregunta, luego la identidad): dos manejadores
   * que relanzan el mismo formulario cada uno por su lado se pisan y
   * acaban preguntando dos veces.
   */
  const reauthSubmit = React.useCallback(
    (previa?: () => Promise<boolean>) => (e: React.FormEvent<HTMLFormElement>) => {
      const form = e.currentTarget;
      if (form.dataset.reauthOk === '1') {
        delete form.dataset.reauthOk;
        return;
      }
      e.preventDefault();
      const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
      void (async () => {
        if (previa && !(await previa())) return;
        if (!(await asegurar()) || !form.isConnected) return;
        form.dataset.reauthOk = '1';
        form.requestSubmit(submitter && submitter.form === form ? submitter : undefined);
      })();
    },
    [asegurar],
  );

  const dialog = (
    <ReauthDialog open={open} conGoogle={conGoogle} onCancel={() => settle(false)} onConfirmed={() => settle(true)} />
  );

  return { asegurar, reauthSubmit, dialog };
}

function ReauthDialog({
  open,
  conGoogle,
  onCancel,
  onConfirmed,
}: {
  open: boolean;
  conGoogle: boolean;
  onCancel: () => void;
  onConfirmed: () => void;
}) {
  const [state, formAction, pending] = React.useActionState<ConfirmarState, FormData>(confirmarIdentidad, null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const minutos = Math.round(REAUTH_VENTANA_MS / 60_000);

  // Confirmada: se avisa una sola vez por respuesta.
  const avisada = React.useRef<ConfirmarState>(null);
  React.useEffect(() => {
    if (state && 'ok' in state && avisada.current !== state) {
      avisada.current = state;
      onConfirmed();
    }
  }, [state, onConfirmed]);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
      <DialogContent showClose={false} initialFocus={inputRef} className="w-[min(92vw,400px)] p-5">
        <DialogHeader className="mb-0 pr-0">
          <DialogTitle className="text-[16px] leading-snug">Confirma que eres tú</DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed text-adm-text-2">
            Esto es delicado, así que te pedimos {conGoogle ? 'confirmar con Google' : 'tu contraseña'} otra vez.
            No te la volveremos a pedir en {minutos} minutos.
          </DialogDescription>
        </DialogHeader>

        {conGoogle ? (
          <div className="mt-4">
            <GoogleStaffButton
              intent="reauth"
              label="Confirmar con Google"
              next={typeof window !== 'undefined' ? window.location.pathname + window.location.search : undefined}
            />
            <p className="mt-2 text-[12px] text-adm-text-3">
              Volverás a esta misma pantalla; después repite lo que ibas a hacer.
            </p>
            <DialogFooter className="mt-4">
              <Button variant="secondary" onClick={onCancel}>Cancelar</Button>
            </DialogFooter>
          </div>
        ) : (
          <form action={formAction} className="mt-4 flex flex-col gap-3">
            <input
              ref={inputRef}
              name="password"
              type="password"
              autoComplete="current-password"
              aria-label="Tu contraseña"
              placeholder="Tu contraseña"
              required
              className="adm-field adm-field-lg"
            />
            {state && 'error' in state && (
              <p role="alert" className="m-0 text-[13px] text-adm-danger">{state.error}</p>
            )}
            <DialogFooter className="mt-1 max-sm:[&>*]:flex-1">
              <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>
              <Button type="submit" variant="primary" disabled={pending}>
                {pending ? 'Comprobando…' : 'Confirmar'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
