'use client';

import { useLayoutEffect, useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { Icon } from '@/components/icons';
import { cn } from '@/lib/utils';

function sobreVelo(event: MouseEvent<HTMLDialogElement>) {
  if (event.target !== event.currentTarget) return false;
  const { top, right, bottom, left } = event.currentTarget.getBoundingClientRect();
  return event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom;
}

export function HojaOperativa({
  label, title, resumen, children, footer, onClose, closeLabel = 'Cerrar', className,
}: {
  label: string;
  title?: ReactNode;
  resumen?: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  onClose: () => void;
  closeLabel?: string;
  className?: string;
}) {
  const panel = useRef<HTMLDialogElement>(null);
  const encabezado = useRef<HTMLHeadingElement>(null);
  const pulsoFuera = useRef(false);

  useLayoutEffect(() => {
    const dialog = panel.current;
    if (!dialog) return;
    const anterior = document.activeElement;
    const overflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    encabezado.current?.focus({ preventScroll: true });
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (anterior instanceof HTMLElement && anterior.isConnected) anterior.focus({ preventScroll: true });
    };
  }, []);

  function manejarTecla(event: KeyboardEvent<HTMLDialogElement>) {
    event.stopPropagation();
    if (event.key !== 'Tab') return;
    const controles = [...event.currentTarget.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]')]
      .filter((el) => el.tabIndex >= 0 && !el.matches(':disabled') && el.getClientRects().length > 0);
    const primero = controles[0];
    const ultimo = controles.at(-1);
    const activo = document.activeElement;
    // El diálogo nativo vuelve inerte la página. Al llegar a un extremo,
    // mantenemos el Tab dentro de la hoja, incluso con un navegador visible.
    const destino = event.shiftKey
      ? (activo === primero || activo === encabezado.current ? ultimo : undefined)
      : (activo === ultimo ? primero : undefined);
    if (destino) {
      event.preventDefault();
      destino.focus();
    }
  }

  return (
    <dialog
      ref={panel}
      className={cn('hoja-operativa', className)}
      aria-label={label}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onKeyDown={manejarTecla}
      onPointerDown={(event) => { pulsoFuera.current = sobreVelo(event); }}
      onClick={(event) => { if (pulsoFuera.current && sobreVelo(event)) onClose(); }}
    >
      <header className="hoja-operativa-cabecera">
        <h2 ref={encabezado} tabIndex={-1}>{title ?? label}</h2>
        <button type="button" className="hoja-operativa-cerrar" aria-label={closeLabel} onClick={onClose}>
          <Icon name="x" size={18} />
        </button>
        {resumen && <div className="hoja-operativa-resumen">{resumen}</div>}
      </header>
      <div className="hoja-operativa-cuerpo">{children}</div>
      <footer className="hoja-operativa-pie">{footer}</footer>
    </dialog>
  );
}
