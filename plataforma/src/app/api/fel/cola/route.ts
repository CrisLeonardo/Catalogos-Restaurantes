/* ============================================================
   COLA DE REINTENTOS FEL — disparador HTTP
   ------------------------------------------------------------
   Drena los documentos PENDIENTE cuyo reintento ya venció.

   Autenticación: Authorization: Bearer <FEL_CRON_SECRET>.

   ── Por qué un endpoint y no pg_cron ──
   El cobro automatizado (migración 035) usa pg_cron porque todo su trabajo
   ocurre dentro de Postgres. Aquí no: reintentar es hablar por HTTPS con el
   certificador, y Postgres no debe salir a internet. Así que el reloj vive
   fuera (un cron job de Render) y esto es lo que llama.

   Cadencia sugerida: cada 5 minutos. El backoff de transmit.ts decide qué
   documento toca; correr más seguido no acelera nada, solo consulta más.
   ============================================================ */

import { procesarColaFel } from '@/lib/fel/transmit';
import { FEL_DISPONIBLE } from '@/lib/modules';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function autorizado(req: Request): boolean {
  const esperado = process.env.FEL_CRON_SECRET;
  // Sin secreto configurado el endpoint queda cerrado, no abierto: un
  // disparador público dejaría a cualquiera provocar tráfico contra el
  // certificador a nombre de los restaurantes.
  if (!esperado) return false;

  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (token.length !== esperado.length) return false;

  // Comparación en tiempo constante, mismo criterio que api-keys.ts.
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ esperado.charCodeAt(i);
  return diff === 0;
}

export async function POST(req: Request) {
  if (!autorizado(req)) {
    return Response.json({ error: 'No autorizado.' }, { status: 401 });
  }

  // Facturación apagada a nivel plataforma: no hay nada que drenar y no se
  // debe transmitir nada al certificador. Se responde 200 y no error, para
  // que el cron no se ponga en rojo cada cinco minutos por algo que es
  // deliberado. Ver el interruptor en lib/modules.ts.
  if (!FEL_DISPONIBLE) {
    return Response.json(
      { ok: true, desactivado: true, procesados: 0, certificados: 0 },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const { procesados, certificados } = await procesarColaFel();
    return Response.json(
      { ok: true, procesados, certificados },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    // Un fallo aquí no debe tumbar el cron: se reporta y la siguiente
    // corrida vuelve a intentar sobre la misma cola.
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : 'Error procesando la cola.' },
      { status: 500 },
    );
  }
}
