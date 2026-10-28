'use server';

/* ============================================================
   TRANSFERENCIA DEL COMENSAL — server actions (migración 149)
   ------------------------------------------------------------
   · El comensal, desde el seguimiento de su pedido (sin cuenta, con el
     token opaco del pedido), sube su comprobante: primero pide una URL
     firmada y el archivo va directo al bucket privado; luego lo registra.
   · El restaurante lo ve desde la tarjeta del pedido y lo confirma o lo
     marca como no recibido.
   ============================================================ */

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/service';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { sendPushToRestaurant } from '@/lib/push';
import { autorizarPedidos } from '@/lib/auth/acceso-pedidos';
import { BUCKET_COMPROBANTES } from '@/lib/db/comprobantes';
import { COMPROBANTE_TIPOS } from '@/lib/pago-plan';
import { rutaComprobantePedidoValida } from '@/lib/pago-transferencia';
import { logActivity } from '@/lib/activity';

const UUID_RE = /^[0-9a-f-]{36}$/i;

/** Cuánto vive el enlace firmado para ver un comprobante desde el panel. */
const FIRMA_SEGUNDOS = 10 * 60;

type PedidoTransferencia = {
  id: string; restaurant_id: string; order_number: string; status: string;
  payment_method: string; transfer_status: string | null; transfer_proof_path: string | null;
};

/** El pedido del token, solo si es de este restaurante, va por transferencia
 *  y todavía admite comprobante. */
async function pedidoDelComensal(token: string, restaurantId: string): Promise<PedidoTransferencia | { error: string }> {
  if (!UUID_RE.test(token) || !UUID_RE.test(restaurantId)) return { error: 'Pedido inválido.' };
  const { data } = await createServiceClient()
    .from('orders')
    .select('id, restaurant_id, order_number, status, payment_method, transfer_status, transfer_proof_path')
    .eq('public_token', token)
    .maybeSingle();
  const p = data as PedidoTransferencia | null;
  if (!p || p.restaurant_id !== restaurantId) return { error: 'Pedido no encontrado.' };
  if (p.payment_method !== 'TRANSFER') return { error: 'Este pedido no se paga por transferencia.' };
  if (p.status === 'CANCEL') return { error: 'Este pedido fue anulado.' };
  if (p.transfer_status === 'CONFIRMADO') return { error: 'El restaurante ya confirmó tu pago.' };
  return p;
}

export async function prepararComprobantePedido(
  token: string,
  restaurantId: string,
  tipo: string,
): Promise<{ ruta: string; token: string } | { error: string }> {
  const ip = clientIp(await headers());
  if (!(await rateLimit(`transfer-proof:${ip}`, 10, 10 * 60_000))) {
    return { error: 'Demasiados intentos. Espera unos minutos.' };
  }
  const ext = COMPROBANTE_TIPOS[tipo];
  if (!ext) return { error: 'Sube una foto (JPG, PNG o WebP) o un PDF.' };
  const p = await pedidoDelComensal(token, restaurantId);
  if ('error' in p) return p;

  const ruta = `pedidos/${restaurantId}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await createServiceClient().storage.from(BUCKET_COMPROBANTES).createSignedUploadUrl(ruta);
  if (error || !data) return { error: 'No se pudo preparar la subida. Inténtalo de nuevo.' };
  return { ruta, token: data.token };
}

export async function registrarComprobantePedido(
  token: string,
  restaurantId: string,
  ruta: string,
): Promise<{ ok: true } | { error: string }> {
  const p = await pedidoDelComensal(token, restaurantId);
  if ('error' in p) return p;
  if (!rutaComprobantePedidoValida(restaurantId, ruta)) return { error: 'El archivo no es válido. Vuelve a subirlo.' };

  const db = createServiceClient();
  const { error } = await db
    .from('orders')
    .update({ transfer_status: 'POR_CONFIRMAR', transfer_proof_path: ruta })
    .eq('id', p.id);
  if (error) return { error: 'No se pudo guardar tu comprobante. Inténtalo de nuevo.' };

  // El comprobante anterior (si se equivocó de foto) ya no sirve de nada.
  if (p.transfer_proof_path && p.transfer_proof_path !== ruta) {
    await db.storage.from(BUCKET_COMPROBANTES).remove([p.transfer_proof_path]);
  }

  sendPushToRestaurant(restaurantId, {
    title: '💳 Comprobante de pago',
    body: `${p.order_number} · revisa la transferencia y confírmala`,
    tag: `transfer-${p.id}`,
    url: '/admin/pedidos',
    // No es 'new_order': ese tipo hace que el panel busque pedidos nuevos y
    // suene como uno. La tarjeta se entera sola por Realtime (UPDATE del pedido).
    type: 'transfer_proof',
  }).catch(() => {});

  revalidatePath('/admin/pedidos');
  revalidatePath('/admin/encargos');
  return { ok: true };
}

/* ── Panel ─────────────────────────────────────────────────── */

type PedidoPanel = {
  id: string; restaurant_id: string; order_number: string;
  payment_method: string; transfer_status: string | null; transfer_proof_path: string | null;
};

async function pedidoDelPanel(orderId: string): Promise<{ error: string } | { pedido: PedidoPanel; userId: string }> {
  if (!UUID_RE.test(orderId)) return { error: 'Pedido inválido.' };
  const { data } = await createServiceClient()
    .from('orders')
    .select('id, restaurant_id, order_number, payment_method, transfer_status, transfer_proof_path')
    .eq('id', orderId)
    .maybeSingle();
  if (!data) return { error: 'Pedido no encontrado.' };
  const auth = await autorizarPedidos(data.restaurant_id as string);
  if ('error' in auth) return { error: auth.error };
  return { pedido: data as PedidoPanel, userId: auth.userId };
}

export async function verComprobantePedido(orderId: string): Promise<{ url: string; esPdf: boolean } | { error: string }> {
  const r = await pedidoDelPanel(orderId);
  if ('error' in r) return { error: r.error };
  const ruta = r.pedido.transfer_proof_path;
  if (!ruta) return { error: 'Este pedido aún no tiene comprobante.' };
  const { data } = await createServiceClient().storage.from(BUCKET_COMPROBANTES).createSignedUrl(ruta, FIRMA_SEGUNDOS);
  if (!data?.signedUrl) return { error: 'El archivo ya no está.' };
  return { url: data.signedUrl, esPdf: ruta.toLowerCase().endsWith('.pdf') };
}

export async function revisarTransferencia(orderId: string, confirmada: boolean): Promise<{ ok: true } | { error: string }> {
  const r = await pedidoDelPanel(orderId);
  if ('error' in r) return { error: r.error };
  if (r.pedido.payment_method !== 'TRANSFER') return { error: 'Este pedido no se paga por transferencia.' };

  const { error } = await createServiceClient()
    .from('orders')
    .update({ transfer_status: confirmada ? 'CONFIRMADO' : 'RECHAZADO' })
    .eq('id', orderId);
  if (error) return { error: error.message };

  await logActivity({
    restaurantId: r.pedido.restaurant_id as string, actorId: r.userId, action: 'transferencia',
    entity: r.pedido.order_number as string, meta: { confirmada },
  });
  revalidatePath('/admin/pedidos');
  revalidatePath('/admin/encargos');
  return { ok: true };
}
