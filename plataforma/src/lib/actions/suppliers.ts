'use server';

import { revalidatePath } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/service';
import { authorizeModuleAction } from '@/lib/module-auth';
import { faltaLaFuncion } from '@/lib/db/migracion-ausente';
import { DESDE, mensajeDeCompra, motivoDeRechazo, type EstadoCompra } from '@/lib/compras/estados';

export type SupplierActionResult = { error?: string; ok?: boolean; id?: string };

// ── Proveedores ─────────────────────────────────────────────

export interface SupplierInput {
  id?: string;
  name: string;
  contact_name: string;
  phone: string;
  email: string;
  notes: string;
}

export async function saveSupplier(restaurantId: string, input: SupplierInput): Promise<SupplierActionResult> {
  const auth = await authorizeModuleAction(restaurantId, 'proveedores');
  if ('error' in auth) return auth;

  const name = input.name.trim();
  if (!name) return { error: 'El nombre del proveedor es requerido.' };

  const db = createServiceClient();
  const row = {
    name,
    contact_name: input.contact_name.trim(),
    phone: input.phone.trim(),
    email: input.email.trim(),
    notes: input.notes.trim(),
  };

  if (input.id) {
    const { error } = await db.from('suppliers').update(row).eq('id', input.id).eq('restaurant_id', restaurantId);
    if (error) return { error: error.message };
  } else {
    const { error } = await db.from('suppliers').insert({ restaurant_id: restaurantId, ...row });
    if (error) return { error: error.message };
  }
  revalidatePath('/admin/proveedores');
  return { ok: true };
}

export async function deleteSupplier(restaurantId: string, id: string): Promise<SupplierActionResult> {
  const auth = await authorizeModuleAction(restaurantId, 'proveedores');
  if ('error' in auth) return auth;

  const db = createServiceClient();
  // No borrar si tiene órdenes; mejor desactivar para conservar historial.
  const { count } = await db
    .from('purchase_orders')
    .select('id', { count: 'exact', head: true })
    .eq('supplier_id', id);
  if ((count ?? 0) > 0) {
    const { error } = await db.from('suppliers').update({ active: false }).eq('id', id).eq('restaurant_id', restaurantId);
    if (error) return { error: error.message };
  } else {
    const { error } = await db.from('suppliers').delete().eq('id', id).eq('restaurant_id', restaurantId);
    if (error) return { error: error.message };
  }
  revalidatePath('/admin/proveedores');
  return { ok: true };
}

// ── Órdenes de compra ───────────────────────────────────────

export interface POLineInput {
  descripcion: string;
  cantidad: number;
  unidad: string;
  costo_unitario: number;
  product_id?: string | null;
  ingredient_id?: string | null;
}

export async function createPurchaseOrder(
  restaurantId: string,
  supplierId: string | null,
  notes: string,
  lines: POLineInput[],
): Promise<SupplierActionResult> {
  const auth = await authorizeModuleAction(restaurantId, 'proveedores');
  if ('error' in auth) return auth;

  const clean = lines
    .map((l) => ({
      descripcion: l.descripcion.trim(),
      cantidad: Number(l.cantidad),
      unidad: (l.unidad || 'unidad').trim(),
      costo_unitario: Number(l.costo_unitario) || 0,
      // Vínculo mutuamente excluyente; product_id gana si por error llegan ambos.
      product_id: l.product_id || null,
      ingredient_id: l.product_id ? null : (l.ingredient_id || null),
    }))
    .filter((l) => l.descripcion && l.cantidad > 0);

  if (clean.length === 0) return { error: 'Agrega al menos un renglón con descripción y cantidad.' };

  const db = createServiceClient();

  /* Cabecera y renglones en una sola transacción (auditoría 0.8, X10).
     Antes iban en dos escrituras: si fallaban los renglones quedaba una
     orden vacía con folio y total. */
  const { data, error } = await db.rpc('leogin_crear_compra', {
    p_restaurant_id: restaurantId,
    p_supplier_id: supplierId,
    p_notes: notes,
    p_lineas: clean,
  });
  if (!error) {
    const fila = (Array.isArray(data) ? data[0] : data) as { id: string } | null;
    revalidatePath('/admin/proveedores');
    return { ok: true, id: fila?.id };
  }
  if (!faltaLaFuncion(error)) return { error: mensajeDeCompra(error, 'No se pudo crear la orden. Intenta de nuevo.') };

  // Sin la 159: como antes, pero sin dejar una cabecera huérfana.
  const { data: folioData } = await db.rpc('leogin_next_po_folio', { p_restaurant_id: restaurantId });
  const folio = (folioData as number) ?? 1;
  const total = clean.reduce((a, l) => a + Math.round(l.cantidad * l.costo_unitario * 100) / 100, 0);

  const { data: po, error: errCabecera } = await db
    .from('purchase_orders')
    .insert({ restaurant_id: restaurantId, supplier_id: supplierId, folio, notes: notes.trim(), total })
    .select('id')
    .single();
  if (errCabecera) return { error: mensajeDeCompra(errCabecera, 'No se pudo crear la orden. Intenta de nuevo.') };

  const poId = po!.id as string;
  const { error: itemsErr } = await db.from('purchase_order_items').insert(
    clean.map((l) => ({
      purchase_order_id: poId,
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      unidad: l.unidad,
      costo_unitario: l.costo_unitario,
      subtotal: Math.round(l.cantidad * l.costo_unitario * 100) / 100,
      product_id: l.product_id,
      ingredient_id: l.ingredient_id,
    })),
  );
  if (itemsErr) {
    await db.from('purchase_orders').delete().eq('id', poId).eq('restaurant_id', restaurantId);
    return { error: mensajeDeCompra(itemsErr, 'No se pudo crear la orden. Intenta de nuevo.') };
  }

  revalidatePath('/admin/proveedores');
  return { ok: true, id: poId };
}

/**
 * Enviar o cancelar. Solo desde los estados que lo permiten (auditoría
 * 0.8): una orden recibida no vuelve a borrador ni se cancela, porque
 * su mercadería ya está en el inventario. Recibir va por el RPC atómico.
 */
export async function setPurchaseOrderStatus(
  restaurantId: string,
  poId: string,
  estado: Exclude<EstadoCompra, 'BORRADOR'>,
): Promise<SupplierActionResult> {
  // Recibir tiene efectos reales (stock + costo promedio) — va por el RPC atómico.
  if (estado === 'RECIBIDA') return receivePurchaseOrder(restaurantId, poId);
  if (estado !== 'ENVIADA' && estado !== 'CANCELADA') return { error: 'Estado no válido.' };

  const auth = await authorizeModuleAction(restaurantId, 'proveedores');
  if ('error' in auth) return auth;

  const stamp: Record<string, string> =
    estado === 'ENVIADA' ? { sent_at: new Date().toISOString() } : {};

  const db = createServiceClient();
  // La condición sobre el estado actual hace la regla atómica aun sin la 159.
  const { data, error } = await db
    .from('purchase_orders')
    .update({ estado, ...stamp })
    .eq('id', poId)
    .eq('restaurant_id', restaurantId)
    .in('estado', [...DESDE[estado]])
    .select('id');
  if (error) return { error: mensajeDeCompra(error, 'No se pudo cambiar la orden. Intenta de nuevo.') };

  if (!data || data.length === 0) {
    const { data: actual } = await db
      .from('purchase_orders')
      .select('estado')
      .eq('id', poId)
      .eq('restaurant_id', restaurantId)
      .maybeSingle();
    revalidatePath('/admin/proveedores');
    if (!actual) return { error: 'Esa orden ya no existe.' };
    const desde = (actual as { estado: string }).estado;
    // Otro aparato ya hizo lo mismo: no es un error.
    if (desde === estado) return { ok: true };
    return { error: motivoDeRechazo(desde, estado) };
  }

  revalidatePath('/admin/proveedores');
  return { ok: true };
}

/**
 * Marca una orden como RECIBIDA aplicando costo promedio ponderado (Kardex)
 * a cada renglón vinculado a un producto o insumo real: suma stock, recalcula
 * el costo, y audita el movimiento en stock_movements. Atómico e idempotente
 * (leogin_receive_purchase_order, migración 088) — service_role únicamente.
 * Desde la 159 una recibida ya no puede reabrirse, así que no se suma dos veces.
 */
export async function receivePurchaseOrder(restaurantId: string, poId: string): Promise<SupplierActionResult> {
  const auth = await authorizeModuleAction(restaurantId, 'proveedores');
  if ('error' in auth) return auth;

  const db = createServiceClient();
  const { error } = await db.rpc('leogin_receive_purchase_order', { p_po_id: poId, p_restaurant_id: restaurantId });
  if (error) return { error: mensajeDeCompra(error, 'No se pudo recibir la orden. Intenta de nuevo.') };

  revalidatePath('/admin/proveedores');
  revalidatePath('/admin/inventario');
  revalidatePath('/admin/ingredientes');
  revalidatePath('/admin/menu');
  return { ok: true };
}
