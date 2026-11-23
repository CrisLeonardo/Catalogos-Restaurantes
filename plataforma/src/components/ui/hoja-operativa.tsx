'use client';

import { useLayoutEffect, useRef, type KeyboardEvent, type MouseEvent, type ReactNode, type TouchEvent } from 'react';
import { Icon } from '@/components/icons-carta';
import { cn } from '@/lib/utils';

function sobreVelo(event: MouseEvent<HTMLDialogElement>) {
  if (event.target !== event.currentTarget) return false;
  const { top, right, bottom, left } = event.currentTarget.getBoundingClientRect();
  return event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom;
}

export function HojaOperativa({
  label, title, resumen, children, footer, onClose, closeLabel = 'Cerrar', className, deslizarParaCerrar = false,
}: {
  label: string;
  title?: ReactNode;
  resumen?: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  onClose: () => void;
  closeLabel?: string;
  className?: string;
  /** Teléfono: arrastrar hacia abajo cierra la hoja (ficha del platillo,
      fase 4 de «La carta que vende»). Solo con la hoja pegada abajo y el
      contenido en su inicio, para no pelear con el desplazamiento. */
  deslizarParaCerrar?: boolean;
}) {
  const panel = useRef<HTMLDialogElement>(null);
  const encabezado = useRef<HTMLHeadingElement>(null);
  const pulsoFuera = useRef(false);
  const arrastre = useRef<{ y0: number; t0: number; dy: number; activo: boolean } | null>(null);

  function empezarArrastre(event: TouchEvent<HTMLDialogElement>) {
    if (!deslizarParaCerrar || event.touches.length !== 1) return;
    // En tablet y PC la hoja es un diálogo centrado: no se arrastra.
    if (window.matchMedia('(min-width: 768px)').matches) return;
    const cuerpo = panel.current?.querySelector('.hoja-operativa-cuerpo');
    const enPie = (event.target as Element).closest('.hoja-operativa-pie');
    if (enPie || (cuerpo && cuerpo.scrollTop > 0 && cuerpo.contains(event.target as Node))) return;
    arrastre.current = { y0: event.touches[0].clientY, t0: performance.now(), dy: 0, activo: false };
  }
  function moverArrastre(event: TouchEvent<HTMLDialogElement>) {
    const a = arrastre.current;
    const dialog = panel.current;
    if (!a || !dialog) return;
    a.dy = Math.max(0, event.touches[0].clientY - a.y0);
    if (!a.activo && a.dy < 8) return;
    a.activo = true;
    dialog.style.transition = 'none';
    dialog.style.transform = `translateY(${a.dy}px)`;
  }
  function soltarArrastre() {
    const a = arrastre.current;
    const dialog = panel.current;
    arrastre.current = null;
    if (!a || !dialog || !a.activo) return;
    const rapido = a.dy / Math.max(1, performance.now() - a.t0) > 0.6;
    if (a.dy > 120 || (rapido && a.dy > 40)) { onClose(); return; }
    dialog.style.transition = 'transform 200ms cubic-bezier(.22,1,.36,1)';
    dialog.style.transform = '';
  }

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
    const controles = [...event.currentTarget.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, summary, [tabindex]')]
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
      onTouchStart={empezarArrastre}
      onTouchMove={moverArrastre}
      onTouchEnd={soltarArrastre}
      onTouchCancel={soltarArrastre}
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
