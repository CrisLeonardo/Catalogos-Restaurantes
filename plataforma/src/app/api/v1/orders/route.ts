/* ============================================================
   POST /api/v1/orders — ingesta de pedidos externos (Fase 5A)
   ------------------------------------------------------------
   Deja que un pedido hecho en PedidosYa, Rappi o UberEats entre a Leogin
   y aparezca en el KDS con los demás, en vez de vivir en una pantalla
   aparte.

   No depende de ningún acuerdo con esas plataformas: cualquier
   middleware (n8n, Zapier, un integrador local) puede empujar pedidos
   aquí hoy. Las integraciones oficiales de la 5B traducirán su webhook a
   este mismo formato.

   Autenticación: Authorization: Bearer lk_live_xxx, con scope
   'orders:write'. Las llaves ya emitidas no lo tienen, así que este
   endpoint nace cerrado para todas ellas.

   Ejemplo:

     curl -X POST https://tudominio.com/api/v1/orders \
       -H "Authorization: Bearer lk_live_xxx" \
       -H "Content-Type: application/json" \
       -d '{
             "channel": "PEDIDOSYA",
             "external_id": "PY-88421",
             "items": [{ "sku": "burger-clasica", "quantity": 2, "note": "sin cebolla" }],
             "customer": { "name": "Ana", "phone": "55550000", "type": "DELIVERY", "address": "Zona 10" },
             "delivery_fee": 15
           }'
   ============================================================ */

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiKey, bearerFromHeaders } from '@/lib/api-keys';
import { rateLimit } from '@/lib/rate-limit';
import { createServiceClient } from '@/lib/supabase/service';
import { createOrder } from '@/lib/actions/orders';
import {
  externalOrderSchema,
  resolveLines,
  toCreateOrderInput,
} from '@/lib/channels';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Permiso que habilita este endpoint. Ver migración 107. */
const SCOPE = 'orders:write';

export async function POST(request: NextRequest) {
  const token = bearerFromHeaders(request.headers);
  const key = await verifyApiKey(token);
  if (!key) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'API key inválida o ausente.' },
      { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } },
    );
  }

  // El límite va por LLAVE, no por IP: un middleware legítimo puede
  // mandar todo desde una sola IP, y limitar por IP castigaría al que se
  // porta bien mientras no frena al que tiene la llave.
  if (!(await rateLimit(`orders:${key.id}`, 120, 60_000))) {
    return NextResponse.json(
      { error: 'rate_limited', message: 'Demasiados pedidos por minuto con esta llave.' },
      { status: 429 },
    );
  }

  if (!key.scopes.includes(SCOPE)) {
    return NextResponse.json(
      {
        error: 'forbidden',
        message: `Esta llave no tiene el permiso "${SCOPE}". Agrégaselo en Canales.`,
      },
      { status: 403 },
    );
  }

  // Una API key puede existir sin restaurante (llaves de plataforma). Esa
  // no sirve aquí y el rechazo es explícito a propósito: el restaurante
  // del pedido sale de la llave, así que una llave sin dueño no tendría
  // contra qué validar el mapa de productos ni dónde crear el pedido.
  const restaurantId = key.restaurant_id;
  if (!restaurantId) {
    return NextResponse.json(
      {
        error: 'forbidden',
        message: 'Esta llave no está asociada a un restaurante y no puede crear pedidos.',
      },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'invalid_json', message: 'El cuerpo no es JSON válido.' },
      { status: 400 },
    );
  }

  const parsed = externalOrderSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return NextResponse.json(
      {
        error: 'invalid_request',
        message: first?.message ?? 'Pedido inválido.',
        field: first?.path.join('.'),
      },
      { status: 400 },
    );
  }
  const pedido = parsed.data;

  // 422 y no 400: el formato es correcto, lo que falta es configuración
  // del restaurante. La distinción importa para el que integra — un 400
  // le dice "arreglá tu payload" y lo mandaría a buscar donde no es.
  const resuelto = await resolveLines(restaurantId, pedido.channel, pedido.items);
  if (!resuelto.ok) {
    return NextResponse.json(
      { error: 'unmapped_products', message: resuelto.error, skus: resuelto.skusDesconocidos },
      { status: 422 },
    );
  }

  const input = toCreateOrderInput(restaurantId, pedido, resuelto.lines);
  const result = await createOrder(input);

  if (result.error || !result.orderId) {
    return NextResponse.json(
      { error: 'order_rejected', message: result.error ?? 'No se pudo crear el pedido.' },
      { status: 422 },
    );
  }

  // El canal queda en el pedido (migración 101): es lo que hace que el
  // chip de origen aparezca en /admin/pedidos y en el KDS, y lo que
  // permite después comparar ventas por canal en la analítica.
  //
  // Va después de createOrder y no dentro porque createOrder es
  // compartido con el checkout web y el hub offline; meterle un
  // parámetro de canal obligaría a tocar los tres caminos.
  const db = createServiceClient();
  await db.from('orders').update({ source: pedido.channel }).eq('id', result.orderId);

  return NextResponse.json(
    {
      ok: true,
      order_id: result.orderId,
      order_number: result.orderNumber,
      channel: pedido.channel,
      external_id: pedido.external_id,
    },
    { status: 201, headers: { 'Cache-Control': 'no-store' } },
  );
}
