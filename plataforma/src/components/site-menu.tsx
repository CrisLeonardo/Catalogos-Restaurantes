'use client';

/* ============================================================
   MENÚ DEL SITIO EN EL TELÉFONO
   ------------------------------------------------------------
   Debajo de 860 px los cinco enlaces de la cabecera se ocultaban
   —"caben logo + Acceder + CTA y nada más"— pero no se movían a
   ninguna parte: en CUALQUIER celular, Producto, Funciones,
   Planes, Demo y Escritorio simplemente no existían. Se llegaba a
   ellos por el pie de página, si uno se acordaba de bajar.

   Esta es su casa en móvil. Es la única isla de cliente del
   chrome del sitio (la cabecera y el pie siguen siendo server
   components): hace falta estado para saber si está abierto y
   para cerrarlo al tocar un enlace — con `<details>` el panel se
   quedaba abierto encima de la sección a la que uno acababa de
   saltar.
   ============================================================ */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

interface Props {
  /** `true` en la landing: las anclas son de esta misma página. Es un
      booleano y no la función que lo resuelve porque una función no cruza
      la frontera servidor → cliente. */
  home?: boolean;
  demoUrl: string;
}

export default function SiteMenu({ home = false, demoUrl }: Props) {
  const anchor = (id: string) => (home ? `#${id}` : `/#${id}`);

  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Tocar fuera o pulsar Esc lo cierra, como cualquier menú.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="lp-menu" ref={box}>
      <button
        type="button"
        className="lp-menu-btn"
        aria-expanded={open}
        aria-label={open ? 'Cerrar el menú' : 'Abrir el menú'}
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          {open ? (
            <>
              <path d="M5 5l10 10" />
              <path d="M15 5L5 15" />
            </>
          ) : (
            <>
              <path d="M3 6h14" />
              <path d="M3 10h14" />
              <path d="M3 14h14" />
            </>
          )}
        </svg>
      </button>

      {open && (
        // Cerrar al tocar cualquier enlace: da igual si es ancla de la misma
        // página o navegación de verdad, el panel no debe sobrevivir al toque.
        <nav className="lp-menu-panel" aria-label="Navegación del sitio" onClick={() => setOpen(false)}>
          <a href={anchor('producto')} className="lp-menu-link">Producto</a>
          <a href={anchor('capacidades')} className="lp-menu-link">Funciones</a>
          <Link href="/planes" className="lp-menu-link">Planes y precios</Link>
          <a href={demoUrl} className="lp-menu-link">Ver una demo</a>
          <Link href="/descargas" className="lp-menu-link">Leogin Escritorio</Link>
          <Link href="/login" className="lp-menu-link lp-menu-link-strong">Acceder al panel</Link>
        </nav>
      )}
    </div>
  );
}
