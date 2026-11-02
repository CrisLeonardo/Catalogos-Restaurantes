'use server';

/* ============================================================
   ENCARGOS — server actions del panel (migración 149)
   ------------------------------------------------------------
   Crear una tanda («Tamales del sábado») y pausarla o reanudarla.
   No se borran: una tanda con pedidos es historia de ventas, y una
   sin pedidos simplemente se pausa y se va sola al pasar su fecha.
   ============================================================ */

import { revalidatePath } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/service';
import { autorizarPedidos } from '@/lib/auth/acceso-pedidos';
import { faltaLaTabla } from '@/lib/db/migracion-ausente';
import {
  estadoEncargo, lugaresLibres, textoCierre, textoEntrega, validarNuevaFecha, type NuevaFechaEntrada,
} from '@/lib/encargos';
import { encargosVisibles } from '@/lib/db/encargos';
import { logActivity } from '@/lib/activity';

const UUID_RE = /^[0-9a-f-]{36}$/i;
const SIN_MIGRACION = 'Los encargos todavía no están disponibles en este servidor.';

export type EncargoResult = { error?: string; ok?: boolean };

function revalidar() {
  revalidatePath('/admin/encargos');
  revalidatePath('/');
}

export async function crearEncargo(restaurantId: string, entrada: NuevaFechaEntrada): Promise<EncargoResult> {
  if (!UUID_RE.test(restaurantId)) return { error: 'Restaurante inválido.' };
  const auth = await autorizarPedidos(restaurantId);
  if ('error' in auth) return { error: auth.error };

  const db = createServiceClient();
  const { data: rest } = await db.from('restaurants').select('timezone').eq('id', restaurantId).single();
  const tz = (rest?.timezone as string) || 'America/Guatemala';

  const v = validarNuevaFecha(entrada, tz);
  if (!v.ok) return { error: v.error };

  const { error } = await db.from('encargo_fechas').insert({ restaurant_id: restaurantId, ...v.fila });
  if (error) return { error: faltaLaTabla(error) ? SIN_MIGRACION : error.message };

  await logActivity({
    restaurantId, actorId: auth.userId, action: 'encargo', entity: v.fila.titulo,
    meta: { evento: 'creado', entrega: v.fila.entrega_fecha, cupo: v.fila.cupo },
  });
  revalidar();
  return { ok: true };
}

export async function cambiarEncargoActivo(restaurantId: string, encargoId: string, activo: boolean): Promise<EncargoResult> {
  if (!UUID_RE.test(restaurantId) || !UUID_RE.test(encargoId)) return { error: 'Encargo inválido.' };
  const auth = await autorizarPedidos(restaurantId);
  if ('error' in auth) return { error: auth.error };

  const { data, error } = await createServiceClient()
    .from('encargo_fechas')
    .update({ activo })
    .eq('id', encargoId)
    .eq('restaurant_id', restaurantId)
    .select('titulo')
    .maybeSingle();
  if (error) return { error: faltaLaTabla(error) ? SIN_MIGRACION : error.message };
  if (!data) return { error: 'Ese encargo ya no existe.' };

  await logActivity({
    restaurantId, actorId: auth.userId, action: 'encargo', entity: data.titulo as string,
    meta: { evento: activo ? 'reanudado' : 'pausado' },
  });
  revalidar();
  return { ok: true };
}

/* ── Público: lo que enseña el menú ────────────────────────── */

export interface EncargoPublico {
  id: string;
  titulo: string;
  entrega: string;
  cierre: string;
  quedan: number;
  lleno: boolean;
  pagoAdelantado: boolean;
}

/**
 * Las tandas abiertas de un restaurante, para la franja del menú. Se pide
 * desde el navegador y no se hornea en la página: el menú se guarda en
 * caché, y «quedan 12» tiene que ser de ahora, no de cuando se armó.
 */
export async function encargosDelMenu(restaurantId: string): Promise<EncargoPublico[]> {
  if (!UUID_RE.test(restaurantId)) return [];
  const db = createServiceClient();
  const { data: rest } = await db.from('restaurants').select('timezone, modules, status').eq('id', restaurantId).maybeSingle();
  if (!rest || rest.status !== 'active' || !(rest.modules as { orders?: boolean } | null)?.orders) return [];
  const tz = (rest.timezone as string) || 'America/Guatemala';

  const fechas = await encargosVisibles(restaurantId);
  return fechas.map((f) => ({
    id: f.id,
    titulo: f.titulo,
    entrega: textoEntrega(f),
    cierre: textoCierre(f.cierreAt, tz),
    quedan: lugaresLibres(f),
    lleno: estadoEncargo(f) === 'lleno',
    pagoAdelantado: f.pagoAdelantado,
  }));
}
