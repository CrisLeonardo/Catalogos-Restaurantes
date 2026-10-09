import { armarEnvelope, parseDsn, type DatosError } from './sentry-core';

/**
 * Manda un error a Sentry (MON-01). APAGADO mientras falte `SENTRY_DSN`:
 * sin la variable no sale ni una petición — mismo patrón que la analítica
 * (lib/analytics.ts).
 *
 * Nunca lanza ni tarda más de 3 s: avisar de un error no puede convertirse
 * en el segundo error de la misma petición.
 */
export async function reportarError(datos: Omit<DatosError, 'entorno' | 'version'>): Promise<void> {
  const dsn = parseDsn(process.env.SENTRY_DSN);
  if (!dsn) return;
  // Las «excepciones» con que Next implementa redirect() y notFound() no
  // son fallos.
  if (datos.digest?.startsWith('NEXT_')) return;

  try {
    await fetch(dsn.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${dsn.publicKey}, sentry_client=leogin/1.0`,
      },
      body: armarEnvelope(dsn, {
        ...datos,
        entorno: process.env.SENTRY_ENVIRONMENT ?? (process.env.NODE_ENV === 'production' ? 'production' : 'development'),
        // Render pone el commit desplegado: el error dice de qué versión es.
        version: process.env.RENDER_GIT_COMMIT?.slice(0, 12),
      }),
      signal: AbortSignal.timeout(3_000),
      cache: 'no-store',
    });
  } catch {
    /* sin Sentry a la vista: el error sigue en los registros de Render */
  }
}
