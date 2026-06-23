'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { isModuleActive, type ModulesMap, type ModuleSettings } from '@/lib/modules';
import {
  buildFacturaDte,
  normalizeNit,
  isValidNit,
  PROVIDER_META,
  type FelProvider,
  type FelSettings,
  type Receptor,
  type FelLineInput,
} from '@/lib/fel';

export type FelActionResult = { error?: string; ok?: boolean; documentId?: string };

/** Verifica sesión, pertenencia al restaurante y que el módulo FEL esté activo. */
async function authorizeFel(restaurantId: string): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, restaurant_id, permissions')
    .eq('id', user.id)
    .single();
  if (!profile) return { error: 'Perfil no encontrado.' };

  const isSuper = profile.role === 'SUPER_ADMIN';
  if (!isSuper) {
    if (profile.restaurant_id !== restaurantId) return { error: 'No autorizado.' };
    const role = profile.role as string;
    const perms = profile.permissions as string[] | null;
    const allowed = role === 'RESTAURANT_OWNER' || (role === 'RESTAURANT_STAFF' && (perms == null || perms.includes('fel')));
    if (!allowed) return { error: 'No autorizado.' };
  }

  const db = createServiceClient();
  const { data: rest } = await db
    .from('restaurants')
    .select('modules, module_settings')
    .eq('id', restaurantId)
    .single();
  if (!rest || !isModuleActive(rest.modules as ModulesMap, rest.module_settings as ModuleSettings, 'fel')) {
    return { error: 'El módulo de Facturación no está activo.' };
  }
  return { ok: true };
}

export interface FelSettingsPatch {
  provider: FelProvider;
  ambiente: 'PRUEBAS' | 'PRODUCCION';
  nit_emisor: string;
  nombre_emisor: string;
  nombre_comercial: string;
  direccion: string;
  codigo_establecimiento: string;
  afiliacion_iva: 'GEN' | 'PEQ';
  iva_incluido: boolean;
  serie_prefijo: string;
  api_usuario: string;
  api_clave: string;
  api_llave_firma: string;
}

export async function saveFelSettings(restaurantId: string, patch: FelSettingsPatch): Promise<FelActionResult> {
  const auth = await authorizeFel(restaurantId);
  if ('error' in auth) return auth;

  if (patch.nit_emisor && !isValidNit(patch.nit_emisor)) {
    return { error: 'El NIT del emisor no es válido.' };
  }

  const db = createServiceClient();
  const { error } = await db.from('fel_settings').upsert({
    restaurant_id: restaurantId,
    provider: patch.provider,
    ambiente: patch.ambiente,
    nit_emisor: normalizeNit(patch.nit_emisor),
    nombre_emisor: patch.nombre_emisor.trim(),
    nombre_comercial: patch.nombre_comercial.trim(),
    direccion: patch.direccion.trim(),
    codigo_establecimiento: patch.codigo_establecimiento.trim() || '1',
    afiliacion_iva: patch.afiliacion_iva,
    iva_incluido: patch.iva_incluido,
    serie_prefijo: patch.serie_prefijo.trim().toUpperCase(),
    api_usuario: patch.api_usuario.trim(),
    api_clave: patch.api_clave,
    api_llave_firma: patch.api_llave_firma,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'restaurant_id' });

  if (error) return { error: error.message };
  revalidatePath('/admin/facturacion');
  return { ok: true };
}

export interface EmitInvoiceInput {
  /** Si viene, se factura ese pedido (itemizado). */
  orderId?: string;
  /** Emisión libre: descripción + monto total (con IVA incluido). */
  descripcion?: string;
  monto?: number;
  receptorNit: string;
  receptorNombre: string;
  receptorDireccion: string;
}

export async function emitInvoice(restaurantId: string, input: EmitInvoiceInput): Promise<FelActionResult> {
  const auth = await authorizeFel(restaurantId);
  if ('error' in auth) return auth;

  const db = createServiceClient();

  const { data: settingsRow } = await db
    .from('fel_settings')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  if (!settingsRow) return { error: 'Configura tus datos fiscales antes de emitir.' };
  const settings = settingsRow as FelSettings;
  if (!settings.nit_emisor || !settings.nombre_emisor) {
    return { error: 'Faltan el NIT y nombre del emisor en la configuración.' };
  }

  // Receptor
  const nit = normalizeNit(input.receptorNit);
  if (!isValidNit(nit)) return { error: 'El NIT del receptor no es válido (usa CF para consumidor final).' };
  const receptor: Receptor = {
    nit,
    nombre: input.receptorNombre.trim() || 'Consumidor Final',
    direccion: input.receptorDireccion.trim() || 'Ciudad',
  };

  // Líneas
  let lines: FelLineInput[] = [];
  let orderId: string | null = null;

  if (input.orderId) {
    const { data: order } = await db
      .from('orders')
      .select('id, total, delivery_fee, items:order_items(name_snapshot, quantity, subtotal)')
      .eq('id', input.orderId)
      .eq('restaurant_id', restaurantId)
      .single();
    if (!order) return { error: 'Pedido no encontrado.' };

    // No duplicar facturas activas del mismo pedido.
    const { count } = await db
      .from('fel_documents')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', input.orderId)
      .neq('estado', 'ANULADO');
    if ((count ?? 0) > 0) return { error: 'Este pedido ya tiene una factura activa.' };

    orderId = order.id as string;
    const items = (order.items as Array<{ name_snapshot: string; quantity: number; subtotal: number }>) ?? [];
    lines = items.map((it) => ({ descripcion: it.name_snapshot, cantidad: it.quantity, total: Number(it.subtotal) }));
    if (Number(order.delivery_fee) > 0) {
      lines.push({ descripcion: 'Servicio de entrega', cantidad: 1, total: Number(order.delivery_fee) });
    }
  } else {
    const monto = Number(input.monto);
    if (!input.descripcion?.trim() || isNaN(monto) || monto <= 0) {
      return { error: 'Indica una descripción y un monto válido.' };
    }
    lines = [{ descripcion: input.descripcion.trim(), cantidad: 1, total: monto }];
  }

  const dte = buildFacturaDte(settings, receptor, lines);

  // ── Certificación ─────────────────────────────────────────
  if (settings.provider === 'MANUAL') {
    // Registro interno con numeración secuencial (sin transmisión al SAT).
    const correlativo = settings.next_correlativo ?? 1;
    const serie = settings.serie_prefijo || (settings.ambiente === 'PRUEBAS' ? 'PRU' : 'FEL');
    const numero = String(correlativo).padStart(6, '0');

    const { data: doc, error: insErr } = await db.from('fel_documents').insert({
      restaurant_id: restaurantId,
      order_id: orderId,
      tipo: 'FACT',
      receptor_nit: receptor.nit,
      receptor_nombre: receptor.nombre,
      receptor_direccion: receptor.direccion,
      moneda: dte.moneda,
      monto_total: dte.granTotal,
      monto_iva: dte.totalImpuesto,
      estado: 'CERTIFICADO',
      uuid_sat: `INT-${crypto.randomUUID()}`,
      serie,
      numero,
      numero_autorizacion: null,
      fecha_certificacion: new Date().toISOString(),
      dte_json: dte as unknown as Record<string, unknown>,
    }).select('id').single();

    if (insErr) return { error: insErr.message };

    await db.from('fel_settings').update({ next_correlativo: correlativo + 1 }).eq('restaurant_id', restaurantId);

    revalidatePath('/admin/facturacion');
    return { ok: true, documentId: doc?.id as string };
  }

  // ── Certificadores reales: interfaz lista, transmisión pendiente de credenciales ──
  // No se crea documento para no dejar registros muertos; se guía al usuario.
  return {
    error: `La transmisión automática con ${PROVIDER_META[settings.provider].label} aún no está conectada en tu cuenta. ` +
      `Mientras tanto puedes usar el modo "Manual (registro interno)" o contactar a Leogin para activar tu certificador.`,
  };
}

export async function anularInvoice(restaurantId: string, documentId: string): Promise<FelActionResult> {
  const auth = await authorizeFel(restaurantId);
  if ('error' in auth) return auth;

  const db = createServiceClient();
  const { error } = await db
    .from('fel_documents')
    .update({ estado: 'ANULADO' })
    .eq('id', documentId)
    .eq('restaurant_id', restaurantId);
  if (error) return { error: error.message };

  revalidatePath('/admin/facturacion');
  return { ok: true };
}
