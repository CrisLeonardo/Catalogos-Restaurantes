'use client';

import { useRef, useState, type ReactNode } from 'react';

/* ============================================================
   LECTURA DE UNA GRÁFICA — tocar una barra dice su cifra.
   ------------------------------------------------------------
   Las barras de Hoy, Pedidos, Métricas y el Super solo decían su
   cifra con `title`, que sale al pasar el ratón: en el teléfono,
   donde el dueño mira el día, no había forma de saber cuánto se
   vendió el martes (auditoría 2026-10-02, NEG-05).

   Las gráficas siguen siendo del servidor. Cada columna lleva su
   texto en `data-tip` y este envoltorio lo escribe debajo al
   tocarla (con ratón, al pasar por encima). Sin tocar nada dice
   `defaultTip` — la barra que la gráfica ya destaca (hoy) —, así
   la línea nunca queda vacía ni salta de alto.
   ============================================================ */

export function ChartReadout({
  children,
  defaultTip,
  className,
}: {
  children: ReactNode;
  defaultTip?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<string | null>(null);

  function pick(target: EventTarget | null) {
    const root = ref.current;
    const el = target instanceof Element ? target.closest<HTMLElement>('[data-tip]') : null;
    if (!root || !el || !root.contains(el)) return;
    root.querySelector('[data-tip-on]')?.removeAttribute('data-tip-on');
    el.setAttribute('data-tip-on', '');
    setTip(el.dataset.tip ?? null);
  }

  function clear() {
    ref.current?.querySelector('[data-tip-on]')?.removeAttribute('data-tip-on');
    setTip(null);
  }

  return (
    <div
      ref={ref}
      className={className}
      onClick={(e) => pick(e.target)}
      onPointerOver={(e) => { if (e.pointerType === 'mouse') pick(e.target); }}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse') clear(); }}
    >
      {children}
      <div aria-live="polite" className="chart-readout">
        {tip ?? defaultTip ?? ' '}
      </div>
    </div>
  );
}
