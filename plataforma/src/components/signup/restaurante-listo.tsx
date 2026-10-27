'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Leo } from '@/components/leo';
import { Confeti } from '@/components/confeti';

/* «Así se ve TU restaurante» (PLAN_MOMENTOS_PICO G1 · estrategia §2.3).
 *
 * Lo que uno ayuda a construir lo valora más (efecto IKEA), y lo que ya es
 * suyo le cuesta soltarlo (dotación). Por eso, recién creado el restaurante
 * y antes de entrar al panel, se le enseña SU menú —con el estilo y el
 * nombre que eligió— en un teléfono, como lo verán sus clientes. Es la
 * misma muestra de la portada (/preview/muestra), que no toca la base.
 *
 * Aquí sí va Leo: Mi cuenta es de Leogin, no el menú del restaurante. */
export function RestauranteListo({ url, estilo, nombre }: { url: string; estilo: string; nombre: string }) {
  const entrarRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { entrarRef.current?.focus(); }, []);

  const muestra = `/preview/muestra?estilo=${encodeURIComponent(estilo)}&nombre=${encodeURIComponent(nombre)}`;

  return createPortal(
    <div className="listo-fondo" role="dialog" aria-modal="true" aria-labelledby="listo-titulo">
      <div className="listo-tarjeta">
        <div className="listo-cabeza">
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <Confeti piezas={34} alcance={0.8} />
            <Leo id="leo-listo" expresion="feliz" size={78} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h2 id="listo-titulo" className="t-display" style={{ fontSize: 22, margin: 0, lineHeight: 1.15 }}>
              ¡Listo! Así se ve <span style={{ color: 'var(--brand-accent-ink, var(--brand-accent))' }}>tu restaurante</span>
            </h2>
            <p style={{ fontSize: 14, lineHeight: 1.45, margin: '6px 0 0', color: 'var(--u-text-3)' }}>
              Así lo verán tus clientes al escanear tu QR. Los colores, las fotos y los platillos los
              cambias cuando quieras.
            </p>
          </div>
        </div>
        <div className="listo-telefono">
          <iframe src={muestra} title={`El menú de ${nombre}`} />
        </div>
        <button
          ref={entrarRef}
          type="button"
          onClick={() => window.location.assign(url)}
          className="press listo-entrar"
        >
          Entrar a mi panel
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
    </div>,
    document.body,
  );
}
