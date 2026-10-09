'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/icons';
import { isStaleBuildError, recoverFromStaleBuild } from '@/lib/stale-build';
import { useReportarError } from '@/lib/observability/report-client-error';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // MON-01: que Leogin se entere, no solo quien lo está viendo.
  useReportarError(error);
  // Pestaña abierta desde antes de un despliegue: el bundle que está
  // corriendo pide archivos que ya no existen. Se recarga sola en vez de
  // dejar al usuario en un callejón sin salida (ver lib/stale-build.ts).
  const [reloading, setReloading] = useState(false);
  const stale = isStaleBuildError(error);
  useEffect(() => {
    if (stale) setReloading(recoverFromStaleBuild());
  }, [stale]);

  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100svh',
        padding: '32px 20px',
        textAlign: 'center',
        gap: 16,
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'rgba(239,68,68,0.15)',
          border: '1px solid rgba(239,68,68,0.30)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ef4444',
        }}
      >
        <Icon name="alertCircle" size={26} />
      </div>

      <div style={{ maxWidth: 320 }}>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 18,
            fontWeight: 700,
            color: 'var(--u-text)',
            marginBottom: 8,
          }}
        >
          {stale ? 'Hay una versión nueva' : 'Algo salió mal'}
        </h2>
        <p style={{ fontSize: 14, color: 'var(--u-text-3)', lineHeight: 1.6 }}>
          {stale
            ? reloading
              ? 'Estamos actualizando la página…'
              : 'Esta pestaña tiene una versión anterior de Leogin. Recárgala para continuar.'
            : error.message || 'Ha ocurrido un error inesperado. Por favor intenta de nuevo.'}
        </p>
      </div>

      <button
        // `reset()` vuelve a montar el MISMO bundle: contra un build viejo no
        // sirve de nada. Ahí la única salida real es recargar del servidor.
        onClick={() => (stale ? window.location.reload() : reset())}
        style={{
          marginTop: 8,
          padding: '11px 24px',
          borderRadius: 'var(--radius-full)',
          background: 'var(--brand-accent)',
          color: '#fff',
          fontWeight: 600,
          fontSize: 14,
          border: 'none',
          cursor: 'pointer',
        }}
      >
        {stale ? 'Recargar' : 'Intentar de nuevo'}
      </button>
    </main>
  );
}
