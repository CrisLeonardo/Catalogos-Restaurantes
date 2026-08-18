'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { canActOnRestaurant } from '@/lib/db/membership';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveGroupBranchId } from '@/lib/db/admin';
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
import { writeCredentials, readCredentials, isSecretKeyConfigured } from '@/lib/fel/credentials';
import { transmitirDocumento } from '@/lib/fel/transmit';
import { getAdapter } from '@/lib/fel/providers/registry';
import type { FelAmbiente } from '@/lib/fel/providers/types';

export type FelActionResult = {
  error?: string;
  ok?: boolean;
  documentId?: string;
  /** Salió bien pero con matices (p. ej. quedó en cola de reintento). */
  aviso?: string;
};

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
    if (profile.role === 'GROUP_OWNER') {
      if ((await resolveGroupBranchId()) !== restaurantId) return { error: 'No autorizado.' };
    } else {
      if (!(await canActOnRestaurant(profile.restaurant_id, restaurantId))) return { error: 'No autorizado.' };
      const role = profile.role as string;
      const perms = profile.permissions as string[] | null;
      const allowed = role === 'RESTAURANT_OWNER' || (role === 'RESTAURANT_STAFF' && (perms == null || perms.includes('fel')));
      if (!allowed) return { error: 'No autorizado.' };
    }
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
  codigo_postal: string;
  municipio: string;
  departamento: string;
  codigo_establecimiento: string;
  afiliacion_iva: 'GEN' | 'PEQ';
  iva_incluido: boolean;
  serie_prefijo: string;
  api_usuario: string;
  /** Vacío = conservar la guardada. La UI nunca recibe el valor actual. */
  api_clave: string;
  /** Vacío = conservar la guardada. */
  api_llave_firma: string;
}

export async function saveFelSettings(restaurantId: string, patch: FelSettingsPatch): Promise<FelActionResult> {
  const auth = await authorizeFel(restaurantId);
  if ('error' in auth) return auth;

  if (patch.nit_emisor && !isValidNit(patch.nit_emisor)) {
    return { error: 'El NIT del emisor no es válido.' };
  }

  const db = createServiceClient();

  // Se leen las credenciales actuales para poder conservarlas cuando el
  // usuario guarda otros campos sin volver a escribir sus llaves.
  const { data: previo } = await db
    .from('fel_settings')
    .select('api_usuario, api_clave, api_llave_firma, api_clave_cipher, api_llave_firma_cipher')
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  // Guardar credenciales exige la clave maestra: sin ella se cifraría con
  // nada y quedarían en claro, que es justo lo que la migración 106 elimina.
  const vaAGuardarSecretos = patch.api_clave.trim() !== '' || patch.api_llave_firma.trim() !== '';
  if (vaAGuardarSecretos && !isSecretKeyConfigured()) {
    return {
      error: 'Falta configurar LEOGIN_SECRET_KEY en el servidor. Sin esa clave no se pueden ' +
        'guardar las credenciales del certificador de forma segura.',
    };
  }

  let credenciales: Record<string, string | null>;
  try {
    credenciales = writeCredentials(
      { usuario: patch.api_usuario, clave: patch.api_clave, llaveFirma: patch.api_llave_firma },
      previo,
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'No se pudieron cifrar las credenciales.' };
  }

  const { error } = await db.from('fel_settings').upsert({
    restaurant_id: restaurantId,
    provider: patch.provider,
    ambiente: patch.ambiente,
    nit_emisor: normalizeNit(patch.nit_emisor),
    nombre_emisor: patch.nombre_emisor.trim(),
    nombre_comercial: patch.nombre_comercial.trim(),
    direccion: patch.direccion.trim(),
    codigo_postal: patch.codigo_postal.trim() || '01001',
    municipio: patch.municipio.trim() || 'Guatemala',
    departamento: patch.departamento.trim() || 'Guatemala',
    codigo_establecimiento: patch.codigo_establecimiento.trim() || '1',
    afiliacion_iva: patch.afiliacion_iva,
    iva_incluido: patch.iva_incluido,
    serie_prefijo: patch.serie_prefijo.trim().toUpperCase(),
    ...credenciales,
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

  // ── Certificadores reales ─────────────────────────────────
  if (!getAdapter(settings.provider)) {
    return {
      error: `La transmisión automática con ${PROVIDER_META[settings.provider].label} aún no está conectada en Leogin. ` +
        `Mientras tanto puedes usar el modo "Manual (registro interno)" o contactar a Leogin para activar tu certificador.`,
    };
  }

  // El documento se guarda PENDIENTE antes de transmitir: si el proceso se
  // cae a mitad, la cola lo recupera. Ver la nota de orden en transmit.ts.
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
    estado: 'PENDIENTE',
    dte_json: dte as unknown as Record<string, unknown>,
    intentos: 0,
  }).select('id').single();

  if (insErr) return { error: insErr.message };
  const documentId = doc?.id as string;

  const res = await transmitirDocumento(documentId);
  revalidatePath('/admin/facturacion');

  // Un PENDIENTE no es un fracaso: la venta quedó registrada y la cola
  // reintenta sola. Se devuelve ok para que la caja no se bloquee, con el
  // mensaje explicando el estado.
  if (res.estado === 'PENDIENTE') {
    return { ok: true, documentId, aviso: res.mensaje };
  }
  if (!res.ok) return { error: res.mensaje, documentId };

  return { ok: true, documentId };
}

/**
 * Anula una factura.
 *
 * Antes esto solo marcaba la fila como ANULADO. Para un registro interno
 * (modo MANUAL) eso basta, pero para un DTE ya certificado no: ante el SAT
 * la factura seguía viva y el restaurante la debía pagar aunque en Leogin
 * se viera anulada. La anulación real es un documento aparte que se
 * transmite al certificador, y hasta que este no confirma, no se toca el
 * estado local — mostrar "anulado" sin haberlo anulado es peor que mostrar
 * el error.
 */
export async function anularInvoice(
  restaurantId: string,
  documentId: string,
  motivo = 'Anulación solicitada por el emisor',
): Promise<FelActionResult> {
  const auth = await authorizeFel(restaurantId);
  if ('error' in auth) return auth;

  const db = createServiceClient();

  const { data: doc } = await db
    .from('fel_documents')
    .select('*')
    .eq('id', documentId)
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  if (!doc) return { error: 'Documento no encontrado.' };
  if (doc.estado === 'ANULADO') return { ok: true };

  const { data: settingsRow } = await db
    .from('fel_settings')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .maybeSingle();
  const settings = settingsRow as FelSettings | null;

  const adapter = settings ? getAdapter(settings.provider) : null;
  const fueCertificadoAnteSat =
    doc.estado === 'CERTIFICADO' && Boolean(doc.uuid_sat) && !String(doc.uuid_sat).startsWith('INT-');

  // Solo hay que transmitir si el SAT tiene el documento. Los registros
  // internos (uuid INT-…) y los que nunca certificaron se anulan localmente.
  if (fueCertificadoAnteSat && adapter && settings) {
    let credentials;
    try {
      credentials = readCredentials(settingsRow!);
    } catch {
      return { error: 'No se pudieron leer las credenciales del certificador para anular.' };
    }

    const res = await adapter.anular({
      uuidOriginal: doc.uuid_sat as string,
      fechaEmisionOriginal: (doc.fecha_certificacion as string) ?? (doc.created_at as string),
      nitEmisor: settings.nit_emisor,
      idReceptor: doc.receptor_nit as string,
      motivo,
      credentials,
      ambiente: settings.ambiente as FelAmbiente,
    });

    if (!res.ok) return { error: res.error };

    const { error } = await db
      .from('fel_documents')
      .update({
        estado: 'ANULADO',
        fecha_anulacion: res.fechaAnulacion,
        motivo_anulacion: motivo,
        proximo_intento: null,
      })
      .eq('id', documentId)
      .eq('restaurant_id', restaurantId);
    if (error) return { error: error.message };

    revalidatePath('/admin/facturacion');
    return { ok: true };
  }

  if (fueCertificadoAnteSat && !adapter) {
    return {
      error: 'Esta factura está certificada ante el SAT y su certificador no está conectado en Leogin. ' +
        'Anúlala desde el portal de tu certificador para que quede anulada también ante el SAT.',
    };
  }

  const { error } = await db
    .from('fel_documents')
    .update({
      estado: 'ANULADO',
      fecha_anulacion: new Date().toISOString(),
      motivo_anulacion: motivo,
      proximo_intento: null,
    })
    .eq('id', documentId)
    .eq('restaurant_id', restaurantId);
  if (error) return { error: error.message };

  revalidatePath('/admin/facturacion');
  return { ok: true };
}

/**
 * Reintenta a mano un documento que quedó pendiente o en error.
 *
 * La cola ya reintenta sola, pero cuando el dueño acaba de corregir sus
 * credenciales no tiene por qué esperar el backoff. Un ERROR vuelve a
 * PENDIENTE con el contador en cero: la corrección merece intentos nuevos.
 */
export async function reintentarInvoice(restaurantId: string, documentId: string): Promise<FelActionResult> {
  const auth = await authorizeFel(restaurantId);
  if ('error' in auth) return auth;

  const db = createServiceClient();
  const { data: doc } = await db
    .from('fel_documents')
    .select('id, estado')
    .eq('id', documentId)
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  if (!doc) return { error: 'Documento no encontrado.' };
  if (doc.estado === 'CERTIFICADO') return { ok: true };
  if (doc.estado === 'ANULADO') return { error: 'El documento está anulado.' };

  await db
    .from('fel_documents')
    .update({ estado: 'PENDIENTE', intentos: 0, proximo_intento: null })
    .eq('id', documentId);

  const res = await transmitirDocumento(documentId);
  revalidatePath('/admin/facturacion');

  if (res.estado === 'PENDIENTE') return { ok: true, aviso: res.mensaje };
  if (!res.ok) return { error: res.mensaje };
  return { ok: true };
}
