'use client';

/* ============================================================
   «NO PUDIMOS CARGAR LA CARTA» (auditoría «La carta que vende», CV-02)
   ------------------------------------------------------------
   Antes una lectura fallida se pintaba como un restaurante sin platos y,
   peor, quedaba guardada un minuto. Ahora la carta dice la verdad y ofrece
   reintentar. Lleva los colores del restaurante (las variables `--brand-*`
   llegan por `style`), no la pantalla genérica de error.
   ============================================================ */

import type { CSSProperties } from 'react';
import { Icon } from '@/components/icons-carta';

export default function CartaNoCargo({
  nombre,
  vars,
}: {
  nombre: string;
  vars: Record<string, string>;
}) {
  return (
    <main
      style={{
        ...(vars as CSSProperties),
        minHeight: '100svh',
        background: 'var(--brand-bg)',
        color: 'var(--u-text)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: '32px 20px',
        textAlign: 'center',
      }}
    >
      <Icon name="alertCircle" size={28} />
      <div style={{ maxWidth: 320 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>No pudimos cargar la carta</h1>
        <p style={{ fontSize: 15, lineHeight: 1.5, color: 'var(--u-text-2)' }}>
          La carta de {nombre} no llegó por un problema de conexión. Inténtalo de nuevo en unos segundos.
        </p>
      </div>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          minHeight: 48,
          padding: '0 24px',
          borderRadius: 999,
          border: 'none',
          background: 'var(--brand-accent)',
          color: 'var(--brand-on-accent)',
          fontSize: 15,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Volver a cargar
      </button>
    </main>
  );
}
