'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';

/* ============================================================
   BARRA DE GUARDADO ÚNICA DEL PANEL (auditoría 2026-10-02, T-08)
   ------------------------------------------------------------
   Había cinco maneras de guardar: la pastilla flotante de «Pedidos y
   cobro», un botón ancho apagado que decía «Sin cambios que guardar»
   (Perfil), botones anchos siempre encendidos (Horarios, Zona de
   entrega), botoncitos a la izquierda dentro de la tarjeta (Lealtad,
   Salón…) y la barra del platillo. Ahora las pantallas de ajustes usan
   esta: la pastilla `.adm-savebar`, que
   · aparece solo cuando hay algo sin guardar (y un momento después de
     guardar, para decir «Guardado»),
   · se queda pegada abajo, así que en el teléfono no hay que bajar hasta
     el final después de tocar un interruptor de arriba,
   · y si te vas con cambios sin guardar, pregunta antes.

   Sin `onSave`, el botón es el `submit` del <form> que la contiene.
   ============================================================ */

export type SaveStatus = { error: string } | { saved: true } | null | undefined;

export default function SaveBar({
  dirty,
  pending = false,
  status,
  onSave,
  label = 'Guardar',
  disabled = false,
  hint,
  guardLeave = true,
}: {
  dirty: boolean;
  pending?: boolean;
  /** Resultado del último guardado: el error se dice en la barra y «guardado» se muestra un momento. */
  status?: SaveStatus;
  onSave?: () => void;
  label?: string;
  /** Apagar el botón aunque haya cambios (p. ej. un campo inválido). */
  disabled?: boolean;
  /** Texto en lugar de «Tienes cambios sin guardar» (p. ej. por qué no se puede guardar). */
  hint?: string;
  /** Preguntar al salir con cambios. `false` cuando la barra sale sin que
   *  se haya tocado nada (p. ej. para activar con los valores de muestra). */
  guardLeave?: boolean;
}) {
  const [justSaved, setJustSaved] = useState(false);
  useEffect(() => {
    if (!status || !('saved' in status)) return;
    setJustSaved(true);
    const t = setTimeout(() => setJustSaved(false), 2500);
    return () => clearTimeout(t);
  }, [status]);

  const leaveDialog = useLeaveGuard(guardLeave && dirty && !pending);

  const error = status && 'error' in status && !pending ? status.error : null;
  const visible = dirty || pending || justSaved || !!error;
  if (!visible) return leaveDialog;

  const text = pending
    ? 'Guardando…'
    : error
      ? error
      : dirty
        ? hint ?? 'Tienes cambios sin guardar'
        : 'Cambios guardados';
  const tone = error ? 'var(--c-danger)' : !dirty && !pending ? 'var(--c-ok)' : 'var(--u-text-3)';

  return (
    <>
      {leaveDialog}
      <div className="adm-savebar" role="status" aria-live="polite">
        <span className="min-w-0 flex-1 text-[13px] leading-snug" style={{ color: tone }}>
          {text}
        </span>
        {(dirty || pending) && (
          <Button
            type={onSave ? 'button' : 'submit'}
            onClick={onSave}
            disabled={pending || disabled}
            className="rounded-adm-full"
          >
            {pending ? 'Guardando…' : label}
          </Button>
        )}
      </div>
    </>
  );
}

/* Mientras `active`, salir de la pantalla pregunta antes:
   · cerrar la pestaña o recargar → el aviso del navegador (el único que
     deja `beforeunload`);
   · tocar un enlace del panel → el diálogo del panel. Se intercepta en
     captura sobre `document`, antes de que el <Link> de Next lo vea, y si
     dicen que sí se navega a mano. */
export function useLeaveGuard(active: boolean) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();

  useEffect(() => {
    if (!active) return;

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return; // tel:, mailto:, wa.me se abren aparte
      const here = window.location;
      if (url.origin === here.origin && url.pathname === here.pathname && url.search === here.search) return;

      e.preventDefault();
      e.stopPropagation();
      void confirm({
        title: '¿Salir sin guardar?',
        description: 'Los cambios de esta pantalla se pierden.',
        confirmLabel: 'Salir sin guardar',
        cancelLabel: 'Seguir aquí',
      }).then((ok) => {
        if (!ok) return;
        window.removeEventListener('beforeunload', onBeforeUnload);
        if (url.origin === here.origin) router.push(url.pathname + url.search + url.hash);
        else window.location.assign(url.href);
      });
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [active, confirm, router]);

  return dialog;
}
