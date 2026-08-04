import { NextRequest, NextResponse } from 'next/server';
import { verifyApiKey, bearerFromHeaders } from '@/lib/api-keys';
import { rateLimit, clientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';

/**
 * Endpoint de ejemplo de la API v1 protegida por API key.
 *   GET /api/v1/me   con header  Authorization: Bearer lk_live_xxx
 * Devuelve a qué llave/recurso corresponde el token. Sirve de plantilla
 * para futuros endpoints (webhooks de pago, conciliación, etc.).
 */
export async function GET(request: NextRequest) {
  // Rate limit por IP (anti fuerza bruta sobre llaves).
  const ip = clientIp(request.headers);
  if (!(await rateLimit(`apikey:${ip}`, 30, 60_000))) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const token = bearerFromHeaders(request.headers);
  const key = await verifyApiKey(token);
  if (!key) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'API key inválida o ausente.' },
      { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } },
    );
  }

  return NextResponse.json({
    ok: true,
    key_id: key.id,
    restaurant_id: key.restaurant_id,
    scopes: key.scopes,
  });
}
