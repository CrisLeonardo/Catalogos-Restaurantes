'use client';

import { useEffect } from 'react';
import { isStaleBuildError } from '@/lib/stale-build';

/**
 * Avisa del error que acaba de pintar una pantalla `error.tsx` (MON-01).
 *
 * Una vez por error, sin esperar respuesta y sin romper nada si falla. Se
 * calla con el error de «pestaña abierta desde antes de un despliegue»: no es
 * un fallo, la pantalla se recarga sola (lib/stale-build.ts).
 */
export function useReportarError(error: Error & { digest?: string }) {
  useEffect(() => {
    // Con `digest` el error nació en el SERVIDOR y ya lo avisó
    // instrumentation.ts (aquí solo llegaría su mensaje genérico, repetido).
    if (isStaleBuildError(error) || error.digest) return;
    try {
      const cuerpo = JSON.stringify({
        tipo: error.name,
        mensaje: error.message || '(sin mensaje)',
        stack: error.stack,
        ruta: window.location.pathname,
      });
      // keepalive: que salga aunque la persona recargue al instante.
      void fetch('/api/errores', {
        method: 'POST',
        body: cuerpo,
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => {});
    } catch {
      /* avisar nunca puede ser el segundo error */
    }
  }, [error]);
}
