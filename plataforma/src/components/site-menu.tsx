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
  /** Canal de ventas real (correo o WhatsApp, site-chrome). En el teléfono
      el contacto quedaba a y≈5300 de la portada (WEB-UX-06). */
  contacto?: string;
}

export default function SiteMenu({ home = false, contacto }: Props) {
  const anchor = (id: string) => (home ? `#${id}` : `/#${id}`);

  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);

  // Tocar fuera o pulsar Esc lo cierra, como cualquier menú. Con Esc el foco
  // vuelve al botón: antes caía en <body> y quien usa teclado tenía que
  // recorrer la página desde arriba (WEB-UX-08).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      boton.current?.focus();
    };
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
        ref={boton}
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
        // `lp-menu-en-barra`: entre 861 y 1080 px esos destinos ya están en la
        // cabecera y el panel solo enseña lo que no cupo (globals.css).
        <nav className="lp-menu-panel" aria-label="Navegación del sitio" onClick={() => setOpen(false)}>
          <a href={anchor('producto')} className="lp-menu-link lp-menu-en-barra">Producto</a>
          <a href={anchor('casos')} className="lp-menu-link lp-menu-en-barra">Elige tu caso</a>
          <Link href="/vende-en-linea" className="lp-menu-link lp-menu-en-barra">Vende en línea</Link>
          <Link href="/planes" className="lp-menu-link lp-menu-en-barra">Planes y precios</Link>
          <a href={anchor('demo')} className="lp-menu-link lp-menu-en-barra">Probar la demo</a>
          <Link href="/descargas" className="lp-menu-link">Leogin Escritorio</Link>
          {contacto && (
            <a href={contacto} target="_blank" rel="noopener noreferrer" className="lp-menu-link lp-menu-link-contacto">Hablar con nosotros</a>
          )}
          <Link href="/login" className="lp-menu-link lp-menu-link-strong lp-menu-en-barra">Acceder al panel</Link>
        </nav>
      )}
    </div>
  );
}
