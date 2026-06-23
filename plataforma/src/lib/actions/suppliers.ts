'use server';

import { revalidatePath } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/service';
import { authorizeModuleAction } from '@/lib/module-auth';

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
    }))
    .filter((l) => l.descripcion && l.cantidad > 0);

  if (clean.length === 0) return { error: 'Agrega al menos un renglón con descripción y cantidad.' };

  const db = createServiceClient();
  const { data: folioData } = await db.rpc('leogin_next_po_folio', { p_restaurant_id: restaurantId });
  const folio = (folioData as number) ?? 1;

  const total = clean.reduce((a, l) => a + l.cantidad * l.costo_unitario, 0);

  const { data: po, error } = await db
    .from('purchase_orders')
    .insert({ restaurant_id: restaurantId, supplier_id: supplierId, folio, notes: notes.trim(), total })
    .select('id')
    .single();
  if (error) return { error: error.message };

  const poId = po!.id as string;
  const { error: itemsErr } = await db.from('purchase_order_items').insert(
    clean.map((l) => ({
      purchase_order_id: poId,
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      unidad: l.unidad,
      costo_unitario: l.costo_unitario,
      subtotal: Math.round(l.cantidad * l.costo_unitario * 100) / 100,
    })),
  );
  if (itemsErr) return { error: itemsErr.message };

  revalidatePath('/admin/proveedores');
  return { ok: true, id: poId };
}

export async function setPurchaseOrderStatus(
  restaurantId: string,
  poId: string,
  estado: 'BORRADOR' | 'ENVIADA' | 'RECIBIDA' | 'CANCELADA',
): Promise<SupplierActionResult> {
  const auth = await authorizeModuleAction(restaurantId, 'proveedores');
  if ('error' in auth) return auth;

  const stamp: Record<string, string> =
    estado === 'ENVIADA'  ? { sent_at: new Date().toISOString() }
    : estado === 'RECIBIDA' ? { received_at: new Date().toISOString() }
    : {};

  const db = createServiceClient();
  const { error } = await db
    .from('purchase_orders')
    .update({ estado, ...stamp })
    .eq('id', poId)
    .eq('restaurant_id', restaurantId);
  if (error) return { error: error.message };

  revalidatePath('/admin/proveedores');
  return { ok: true };
}
