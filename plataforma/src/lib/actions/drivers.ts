'use server';

/* ============================================================
   REPARTO (Fase 2)
   ------------------------------------------------------------
   Dos públicos distintos en el mismo archivo:

   · El DUEÑO da de alta repartidores y les asigna pedidos.
     Permiso: sección 'repartidores'.

   · El REPARTIDOR marca "recogí" y "entregué" desde su teléfono.
     Permiso: sección 'reparto'. Además de ese permiso, cada acción
     comprueba que el pedido esté asignado A ÉL — el permiso dice que puede
     repartir, no que pueda tocar el pedido de otro. Sin ese segundo
     candado, cualquier repartidor podría cerrar la entrega de un compañero.

   El cobro se registra al entregar porque Leogin no cobra en línea: el
   dinero pasa por las manos del repartidor y sin ese dato no hay cuadre.
   ============================================================ */

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveGroupBranchId } from '@/lib/db/admin';
import { resolveOwnRestaurantId } from '@/lib/db/membership';
import { can } from '@/lib/permissions';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { logActivity } from '@/lib/activity';
import { notifyOrderStatus } from '@/lib/whatsapp/notify';

export type DriverState = { error: string } | { ok: true } | null;

/** Contexto del DUEÑO (gestión de repartidores). */
async function adminContext(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('restaurant_id, role, permissions')
    .eq('id', user.id)
    .single();
  if (!profile) return null;

  if (!can(profile.role, profile.permissions as string[] | null, 'repartidores')) return null;

  // Quien administra un grupo entra a la sucursal del subdominio, verificada
  // contra su organización; el resto, al suyo. `resolveGroupBranchId` da null
  // si no administra ninguno (migración 116).
  const restaurantId = profile.role === 'SUPER_ADMIN'
    ? (formData.get('restaurantId') as string)
    : ((await resolveGroupBranchId()) ?? (await resolveOwnRestaurantId(profile.restaurant_id)));

  if (!restaurantId) return null;
  return { db: createServiceClient(), restaurantId, userId: user.id };
}

/**
 * Contexto del REPARTIDOR: además del permiso, resuelve QUÉ repartidor es.
 * Devuelve null si el perfil no está enlazado a ninguna fila de drivers —
 * tener el permiso no basta para mover pedidos.
 */
async function driverContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('restaurant_id, role, permissions')
    .eq('id', user.id)
    .single();
  if (!profile) return null;

  if (!can(profile.role, profile.permissions as string[] | null, 'reparto')) return null;

  const db = createServiceClient();
  const { data: driver } = await db
    .from('drivers')
    .select('id, restaurant_id, activo')
    .eq('profile_id', user.id)
    .single();

  if (!driver || !driver.activo) return null;

  return {
    db,
    driverId: driver.id as string,
    restaurantId: driver.restaurant_id as string,
    userId: user.id,
  };
}

/* ── Gestión (dueño) ─────────────────────────────────────── */

export async function saveDriver(prevState: DriverState, formData: FormData): Promise<DriverState> {
  const ctx = await adminContext(formData);
  if (!ctx) return { error: 'No autorizado.' };

  const id = (formData.get('id') as string)?.trim() || null;
  const nombre = (formData.get('nombre') as string)?.trim();
  if (!nombre) return { error: 'El nombre es requerido.' };

  const row = {
    nombre,
    telefono: (formData.get('telefono') as string)?.trim() || null,
    vehiculo: (formData.get('vehiculo') as string)?.trim() || null,
    profile_id: (formData.get('profile_id') as string)?.trim() || null,
    updated_at: new Date().toISOString(),
  };

  const { error } = id
    ? await ctx.db.from('drivers').update(row).eq('id', id).eq('restaurant_id', ctx.restaurantId)
    : await ctx.db.from('drivers').insert({ ...row, restaurant_id: ctx.restaurantId });

  if (error) return { error: error.message };

  revalidatePath('/admin/repartidores');
  return { ok: true };
}

/** Activa/desactiva. No se borra: un repartidor dado de baja sigue siendo el
 *  responsable de las entregas que ya hizo, y borrarlo dejaría esos pedidos
 *  sin dueño en el historial. */
export async function toggleDriverActive(formData: FormData): Promise<void> {
  const ctx = await adminContext(formData);
  if (!ctx) return;

  const id = formData.get('id') as string;
  const activo = formData.get('activo') === 'true';

  await ctx.db
    .from('drivers')
    .update({ activo, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('restaurant_id', ctx.restaurantId);

  revalidatePath('/admin/repartidores');
}

/** Asigna (o quita, con driverId vacío) el repartidor de un pedido. */
export async function assignDriver(formData: FormData): Promise<void> {
  const ctx = await adminContext(formData);
  if (!ctx) return;

  const orderId = formData.get('orderId') as string;
  const driverId = (formData.get('driverId') as string)?.trim() || null;
  if (!orderId) return;

  // El pedido tiene que ser de este restaurante: el id viene de un form.
  await ctx.db
    .from('orders')
    .update({
      driver_id: driverId,
      assigned_at: driverId ? new Date().toISOString() : null,
    })
    .eq('id', orderId)
    .eq('restaurant_id', ctx.restaurantId);

  logActivity({
    restaurantId: ctx.restaurantId,
    actorId: ctx.userId,
    action: 'driver_assign',
    entity: orderId,
    meta: { driverId },
  });

  revalidatePath('/admin/pedidos');
  revalidatePath('/repartidor');
}

/* ── Operación (repartidor) ──────────────────────────────── */

/** "Salí con el pedido": READY → TRANSIT. */
export async function markPickedUp(formData: FormData): Promise<void> {
  const ctx = await driverContext();
  if (!ctx) return;

  const orderId = formData.get('orderId') as string;
  if (!orderId) return;

  const now = new Date().toISOString();
  const { data: changed } = await ctx.db
    .from('orders')
    .update({ status: 'TRANSIT', picked_up_at: now })
    .eq('id', orderId)
    .eq('driver_id', ctx.driverId)   // candado: solo lo suyo
    .eq('status', 'READY')           // y solo desde el estado correcto
    .select('id');

  if ((changed?.length ?? 0) > 0) {
    after(() => notifyOrderStatus(orderId, 'TRANSIT'));
  }

  revalidatePath('/repartidor');
  revalidatePath('/admin/pedidos');
}

/** "Entregué": TRANSIT → DELIVERED, registrando el efectivo recibido. */
export async function markDelivered(formData: FormData): Promise<void> {
  const ctx = await driverContext();
  if (!ctx) return;

  const orderId = formData.get('orderId') as string;
  if (!orderId) return;

  const raw = (formData.get('cash_collected') as string)?.trim();
  const cash = raw ? Number(raw) : NaN;

  const now = new Date().toISOString();
  const { data: changed } = await ctx.db
    .from('orders')
    .update({
      status: 'DELIVERED',
      delivered_at: now,
      // Solo si viene un número válido: entregar sin registrar efectivo es
      // válido (pago con tarjeta al recibir), pero un valor basura no.
      ...(Number.isFinite(cash) && cash >= 0 ? { cash_collected: cash } : {}),
    })
    .eq('id', orderId)
    .eq('driver_id', ctx.driverId)
    .eq('status', 'TRANSIT')
    .select('id');

  if ((changed?.length ?? 0) > 0) {
    after(() => notifyOrderStatus(orderId, 'DELIVERED'));
    logActivity({
      restaurantId: ctx.restaurantId,
      actorId: ctx.userId,
      action: 'driver_delivered',
      entity: orderId,
      meta: { cash: Number.isFinite(cash) ? cash : null },
    });
  }

  revalidatePath('/repartidor');
  revalidatePath('/admin/pedidos');
}
