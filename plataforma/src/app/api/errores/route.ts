import { headers } from 'next/headers';
import { reportarError } from '@/lib/observability/sentry';
import { rutaSegura } from '@/lib/observability/sentry-core';
import { rateLimit, clientIp } from '@/lib/rate-limit';

/**
 * Errores del NAVEGADOR (MON-01): los que revientan una pantalla en el
 * teléfono del cliente sin pasar por el servidor. Las pantallas de error
 * (`error.tsx`) los mandan aquí y desde aquí van a Sentry — así el navegador
 * no carga ningún SDK.
 *
 * Público a propósito (el error puede ocurrir sin sesión, en el menú del
 * comensal), así que: límite por IP, cuerpo pequeño, solo texto, y sin
 * Sentry configurado no hace nada.
 */
export const runtime = 'nodejs';

const MAX_BYTES = 8_000;

export async function POST(request: Request) {
  if (!process.env.SENTRY_DSN) return new Response(null, { status: 204 });

  const ip = clientIp(await headers());
  if (!(await rateLimit(`errores:${ip}`, 30, 10 * 60_000))) return new Response(null, { status: 429 });

  const texto = await request.text();
  if (texto.length > MAX_BYTES) return new Response(null, { status: 413 });

  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = JSON.parse(texto) as Record<string, unknown>;
  } catch {
    return new Response(null, { status: 400 });
  }
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : undefined);

  const mensaje = str(cuerpo.mensaje, 1000);
  if (!mensaje) return new Response(null, { status: 400 });

  await reportarError({
    tipo: str(cuerpo.tipo, 80) ?? 'Error',
    mensaje,
    stack: str(cuerpo.stack, 6000),
    origen: 'navegador',
    ruta: rutaSegura(str(cuerpo.ruta, 300)),
    digest: str(cuerpo.digest, 80),
  });
  return new Response(null, { status: 204 });
}
