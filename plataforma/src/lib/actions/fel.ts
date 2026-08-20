'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { canActOnRestaurant } from '@/lib/db/membership';
import { createServiceClient } from '@/lib/supabase/service';
import { canActOnGroupBranch } from '@/lib/db/admin';
import { isModuleActive, FEL_DISPONIBLE, type ModulesMap, type ModuleSettings } from '@/lib/modules';
import {
  armarDocumento,
  problemasParaEmitir,
  ventanaDeAnulacion,
  PROVIDER_META,
  type FelProvider,
  type FelSettings,
  type ReceptorFactura,
  type OrigenDocumento,
} from '@/lib/fel';
import { interpretarReceptorId, receptorExtranjero, explicarIdInvalido, esNitValido } from '@/lib/fel/nit';
import type { RegimenIva, RegimenIsr } from '@/lib/fel/frases';
import type { PedidoParaFacturar } from '@/lib/fel/totales';
import { felDate } from '@/lib/fel/xml';
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

/** Código de Postgres para violación de índice único. */
const UNIQUE_VIOLATION = '23505';

/** Verifica sesión, pertenencia al restaurante y que el módulo FEL esté activo. */
async function authorizeFel(
  restaurantId: string,
): Promise<{ error: string } | { ok: true; userId: string; esDueno: boolean }> {
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
  let esDueno = isSuper;

  if (!isSuper) {
    // Quien administra el grupo de esta sucursal entra por ahí; el resto,
    // por su propio restaurante (migración 116).
    if (await canActOnGroupBranch(restaurantId)) {
      esDueno = true;
    } else {
      if (!(await canActOnRestaurant(profile.restaurant_id, restaurantId))) return { error: 'No autorizado.' };
      const role = profile.role as string;
      const perms = profile.permissions as string[] | null;
      esDueno = role === 'RESTAURANT_OWNER';
      const allowed = esDueno || (role === 'RESTAURANT_STAFF' && (perms == null || perms.includes('fel')));
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
  return { ok: true, userId: user.id, esDueno };
}

async function leerSettings(restaurantId: string): Promise<FelSettings | null> {
  const db = createServiceClient();
  const { data } = await db
    .from('fel_settings')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .maybeSingle();
  return (data as FelSettings) ?? null;
}

/* ── Configuración ──────────────────────────────────────────── */

export interface FelSettingsPatch {
  provider: FelProvider;
  ambiente: 'PRUEBAS' | 'PRODUCCION';
  nit_emisor: string;
  nombre_emisor: string;
  nombre_comercial: string;
  correo_emisor: string;
  direccion: string;
  codigo_postal: string;
  municipio: string;
  departamento: string;
  codigo_establecimiento: string;
  regimen_iva: RegimenIva;
  regimen_isr: RegimenIsr;
  agente_retencion_iva: boolean;
  numero_resolucion: string;
  fecha_resolucion: string;
  iva_incluido: boolean;
  emision_automatica: boolean;
  facturar_propina: boolean;
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

  // El NIT del emisor se valida con dígito verificador, no solo por forma:
  // un NIT mal tecleado aquí rompe TODAS las facturas del restaurante, y el
  // rechazo del certificador llega mucho después, en mitad de un cobro.
  if (patch.nit_emisor && !esNitValido(patch.nit_emisor)) {
    return { error: `NIT del emisor: ${explicarIdInvalido(patch.nit_emisor)}` };
  }

  const db = createServiceClient();

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
    nit_emisor: patch.nit_emisor.trim().toUpperCase().replace(/[\s-]/g, ''),
    nombre_emisor: patch.nombre_emisor.trim(),
    nombre_comercial: patch.nombre_comercial.trim(),
    correo_emisor: patch.correo_emisor.trim() || null,
    direccion: patch.direccion.trim(),
    codigo_postal: patch.codigo_postal.trim() || '01001',
    municipio: patch.municipio.trim() || 'Guatemala',
    departamento: patch.departamento.trim() || 'Guatemala',
    codigo_establecimiento: patch.codigo_establecimiento.trim() || '1',
    regimen_iva: patch.regimen_iva,
    regimen_isr: patch.regimen_isr,
    agente_retencion_iva: patch.agente_retencion_iva,
    numero_resolucion: patch.numero_resolucion.trim() || null,
    fecha_resolucion: patch.fecha_resolucion.trim() || null,
    // Se mantiene la columna vieja en sincronía por si alguna consulta
    // heredada todavía la mira.
    afiliacion_iva: patch.regimen_iva === 'GENERAL' ? 'GEN' : 'PEQ',
    iva_incluido: patch.iva_incluido,
    emision_automatica: patch.emision_automatica,
    facturar_propina: patch.facturar_propina,
    serie_prefijo: patch.serie_prefijo.trim().toUpperCase(),
    ...credenciales,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'restaurant_id' });

  if (error) return { error: error.message };
  revalidatePath('/admin/facturacion');
  return { ok: true };
}

/* ── Emisión ────────────────────────────────────────────────── */

export interface EmitInvoiceInput {
  /** Si viene, se factura ese pedido (itemizado). */
  orderId?: string;
  /** Emisión libre: descripción + monto total (con IVA incluido). */
  descripcion?: string;
  monto?: number;
  /** NIT, DPI o CF. Vacío = consumidor final. */
  receptorId: string;
  receptorNombre: string;
  receptorDireccion?: string;
  receptorCorreo?: string;
  /** El cliente se identifica con pasaporte u otro documento extranjero. */
  receptorEsExtranjero?: boolean;
}

/** Traduce lo que se escribió en la caja a un receptor válido, o explica por qué no. */
function resolverReceptor(input: EmitInvoiceInput): { receptor: ReceptorFactura } | { error: string } {
  const id = input.receptorEsExtranjero
    ? receptorExtranjero(input.receptorId)
    : interpretarReceptorId(input.receptorId);

  if (!id) return { error: explicarIdInvalido(input.receptorId) };

  const nombre = input.receptorNombre.trim() || (id.tipo === 'CF' ? 'Consumidor Final' : '');
  if (!nombre) {
    return { error: 'Falta el nombre del cliente. Debe coincidir con el que la SAT tiene registrado para ese NIT.' };
  }

  const correo = (input.receptorCorreo ?? '').trim();
  if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    return { error: 'El correo del cliente no es válido. Déjalo vacío si no lo tienes.' };
  }

  return {
    receptor: {
      id,
      nombre,
      correo: correo || null,
      direccion: input.receptorDireccion?.trim() || 'Ciudad',
    },
  };
}

/** Convierte un pedido de la base en lo que necesita el cálculo de montos. */
interface OrderRow {
  id: string;
  total: number;
  delivery_fee: number | null;
  tip: number | null;
  discount: number | null;
  loyalty_discount: number | null;
  status: string;
  items: Array<{ name_snapshot: string; quantity: number; subtotal: number }> | null;
}

function pedidoDesdeOrden(order: OrderRow): PedidoParaFacturar {
  return {
    lineas: (order.items ?? []).map((it) => ({
      descripcion: it.name_snapshot,
      cantidad: Number(it.quantity),
      importe: Number(it.subtotal),
    })),
    envio: Number(order.delivery_fee ?? 0),
    descuento: Number(order.discount ?? 0),
    descuentoLealtad: Number(order.loyalty_discount ?? 0),
    propina: Number(order.tip ?? 0),
    totalCobrado: Number(order.total),
  };
}

const CAMPOS_ORDEN =
  'id, total, delivery_fee, tip, discount, loyalty_discount, status, items:order_items(name_snapshot, quantity, subtotal)';

export async function emitInvoice(restaurantId: string, input: EmitInvoiceInput): Promise<FelActionResult> {
  const auth = await authorizeFel(restaurantId);
  if ('error' in auth) return auth;
  return emitirDocumento(restaurantId, input, 'PANEL', auth.userId);
}

/**
 * Emite una factura. Núcleo compartido por el panel y por la caja.
 *
 * No autoriza: quien llama ya lo hizo. Se separa así porque la emisión
 * automática al cobrar corre en el contexto del pedido, no en el de una
 * sesión de administrador.
 */
async function emitirDocumento(
  restaurantId: string,
  input: EmitInvoiceInput,
  origen: OrigenDocumento,
  userId: string | null,
): Promise<FelActionResult> {
  const db = createServiceClient();

  const settings = await leerSettings(restaurantId);
  if (!settings) return { error: 'Configura tus datos fiscales antes de emitir.' };

  const problemas = problemasParaEmitir(settings);
  if (problemas.length > 0) {
    return { error: `No se puede emitir todavía: ${problemas[0]}` };
  }

  const res = resolverReceptor(input);
  if ('error' in res) return res;
  const { receptor } = res;

  // ── Origen de los montos ──────────────────────────────────
  let pedido: PedidoParaFacturar;
  let orderId: string | null = null;

  if (input.orderId) {
    const { data: order } = await db
      .from('orders')
      .select(CAMPOS_ORDEN)
      .eq('id', input.orderId)
      .eq('restaurant_id', restaurantId)
      .single();
    if (!order) return { error: 'Pedido no encontrado.' };
    if ((order as unknown as OrderRow).status === 'CANCEL') {
      return { error: 'Ese pedido está cancelado: no se puede facturar.' };
    }
    orderId = input.orderId;
    pedido = pedidoDesdeOrden(order as unknown as OrderRow);
  } else {
    const monto = Number(input.monto);
    if (!input.descripcion?.trim() || Number.isNaN(monto) || monto <= 0) {
      return { error: 'Indica una descripción y un monto válido.' };
    }
    pedido = { lineas: [{ descripcion: input.descripcion.trim(), cantidad: 1, importe: monto }] };
  }

  const armado = armarDocumento({ settings, receptor, pedido });
  if (armado.errores.length > 0) {
    return { error: armado.errores[0] };
  }

  const esFiscal = settings.provider !== 'MANUAL';

  const filaBase = {
    restaurant_id: restaurantId,
    order_id: orderId,
    tipo: armado.tipo,
    receptor_nit: receptor.id.valor,
    receptor_tipo_id: receptor.id.tipo,
    receptor_nombre: receptor.nombre,
    receptor_direccion: receptor.direccion ?? 'Ciudad',
    receptor_correo: receptor.correo,
    moneda: armado.documento.moneda,
    monto_total: armado.montos.granTotal,
    monto_iva: armado.montos.totalImpuesto,
    propina_excluida: armado.montos.propinaExcluida,
    provider: settings.provider,
    es_fiscal: esFiscal,
    origen,
    emitido_por: userId,
    dte_json: armado.documento as unknown as Record<string, unknown>,
  };

  /* ── Sin certificador: registro interno, SIN validez fiscal ── */
  if (!esFiscal) {
    // El correlativo se pide a la base, que serializa a dos cajas
    // simultáneas. Antes se leía y se escribía por separado y dos cobros a
    // la vez tomaban el mismo número.
    const { data: correlativo, error: corrErr } = await db.rpc('fel_siguiente_correlativo', {
      p_restaurant_id: restaurantId,
    });
    if (corrErr) return { error: `No se pudo asignar el número: ${corrErr.message}` };

    const serie = settings.serie_prefijo || 'INT';
    const { data: doc, error: insErr } = await db.from('fel_documents').insert({
      ...filaBase,
      estado: 'CERTIFICADO',
      uuid_sat: `INT-${crypto.randomUUID()}`,
      serie,
      numero: String(correlativo).padStart(6, '0'),
      fecha_certificacion: new Date().toISOString(),
    }).select('id').single();

    if (insErr) return { error: mensajeDeInsercion(insErr) };

    revalidatePath('/admin/facturacion');
    return {
      ok: true,
      documentId: doc?.id as string,
      aviso: 'Registro interno creado. OJO: no es una factura ante el SAT — para eso necesitas un certificador.',
    };
  }

  /* ── Con certificador ─────────────────────────────────────── */
  if (!getAdapter(settings.provider)) {
    return {
      error: `${PROVIDER_META[settings.provider].label} todavía no está conectado en Leogin. ` +
        'Contacta a Leogin para activarlo.',
    };
  }

  // El documento se guarda PENDIENTE antes de transmitir: si el proceso se
  // cae a mitad, la cola lo recupera. Ver la nota de orden en transmit.ts.
  const { data: doc, error: insErr } = await db.from('fel_documents').insert({
    ...filaBase,
    estado: 'PENDIENTE',
    intentos: 0,
  }).select('id').single();

  if (insErr) return { error: mensajeDeInsercion(insErr) };
  const documentId = doc?.id as string;

  const trans = await transmitirDocumento(documentId);
  revalidatePath('/admin/facturacion');

  // Un PENDIENTE no es un fracaso: la venta quedó registrada y la cola
  // reintenta sola. Se devuelve ok para que la caja no se bloquee, con el
  // mensaje explicando el estado.
  if (trans.estado === 'PENDIENTE') return { ok: true, documentId, aviso: trans.mensaje };
  if (!trans.ok) return { error: trans.mensaje, documentId };
  return { ok: true, documentId };
}

function mensajeDeInsercion(err: { code?: string; message: string }): string {
  if (err.code === UNIQUE_VIOLATION) {
    // El índice único de la migración 118. Llegar aquí significa que otra
    // caja facturó el mismo pedido en el mismo instante — que es justo lo
    // que el índice existe para impedir.
    return 'Ese pedido ya tiene una factura activa. Búscala en el historial antes de emitir otra.';
  }
  return err.message;
}

/**
 * Emisión automática al cerrar el cobro.
 *
 * Se llama desde el flujo del pedido, no desde el panel, así que no hay
 * sesión de administrador: la autorización es haber podido cobrar. Nunca
 * lanza — un fallo de facturación no puede tumbar una venta ya cobrada; el
 * documento queda registrado o el pedido queda sin factura y visible en el
 * panel para emitirla a mano.
 */
export async function emitirFacturaAutomatica(
  restaurantId: string,
  orderId: string,
): Promise<{ emitida: boolean; motivo?: string }> {
  try {
    const db = createServiceClient();

    // Doble candado a propósito. isModuleActive() ya respeta el interruptor
    // general, pero este es el único sitio del sistema que emite documentos
    // fiscales SIN que una persona lo pida, así que el apagado se comprueba
    // aquí de forma visible para quien lea solo esta función.
    if (!FEL_DISPONIBLE) return { emitida: false, motivo: 'Facturación desactivada en la plataforma.' };

    const { data: rest } = await db
      .from('restaurants')
      .select('modules, module_settings')
      .eq('id', restaurantId)
      .single();
    if (!rest || !isModuleActive(rest.modules as ModulesMap, rest.module_settings as ModuleSettings, 'fel')) {
      return { emitida: false, motivo: 'Módulo de facturación inactivo.' };
    }

    const settings = await leerSettings(restaurantId);
    if (!settings) return { emitida: false, motivo: 'Sin configuración fiscal.' };
    if (!settings.emision_automatica) return { emitida: false, motivo: 'Emisión automática apagada.' };

    // Un restaurante recién configurado no debe emitir a medias: si falta
    // cualquier dato fiscal, no se factura y el dueño lo ve en el panel.
    const problemas = problemasParaEmitir(settings);
    if (problemas.length > 0) return { emitida: false, motivo: problemas[0] };

    const { data: yaTiene } = await db
      .from('fel_documents')
      .select('id')
      .eq('order_id', orderId)
      .neq('estado', 'ANULADO')
      .in('tipo', ['FACT', 'FPEQ'])
      .maybeSingle();
    if (yaTiene) return { emitida: false, motivo: 'El pedido ya tiene factura.' };

    const res = await emitirDocumento(
      restaurantId,
      { orderId, receptorId: 'CF', receptorNombre: 'Consumidor Final' },
      'CAJA',
      null,
    );

    if (res.error) return { emitida: false, motivo: res.error };
    return { emitida: true, motivo: res.aviso };
  } catch (e) {
    // Nunca propagar: la venta ya ocurrió y el cobro no se revierte porque
    // el certificador tuviera un mal día.
    return { emitida: false, motivo: e instanceof Error ? e.message : 'Error al facturar.' };
  }
}

/* ── Anulación y nota de crédito ────────────────────────────── */

/**
 * Anula una factura ante el SAT.
 *
 * Anular no es borrar una fila: es transmitir un documento aparte, y el
 * SAT solo lo admite dentro de una ventana corta desde la emisión. Pasada
 * esa ventana la factura sigue viva y la única corrección válida es una
 * nota de crédito.
 *
 * Por eso aquí se rechaza en vez de "anular localmente": marcar como
 * anulado algo que ante el SAT sigue vigente es el peor resultado posible
 * — el restaurante creería que ya no debe esa factura, y la debe.
 */
export async function anularInvoice(
  restaurantId: string,
  documentId: string,
  motivo = '',
): Promise<FelActionResult> {
  const auth = await authorizeFel(restaurantId);
  if ('error' in auth) return auth;

  const razon = motivo.trim();
  if (razon.length < 5) {
    return { error: 'Escribe el motivo de la anulación (el SAT lo exige y queda en el documento).' };
  }

  const db = createServiceClient();

  const { data: doc } = await db
    .from('fel_documents')
    .select('*')
    .eq('id', documentId)
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  if (!doc) return { error: 'Documento no encontrado.' };
  if (doc.estado === 'ANULADO') return { ok: true };

  const settings = await leerSettings(restaurantId);
  const adapter = settings ? getAdapter(settings.provider) : null;
  const anteSat = Boolean(doc.es_fiscal) && doc.estado === 'CERTIFICADO' && Boolean(doc.uuid_sat);

  /* Documento interno o que nunca llegó al SAT: se cierra localmente. */
  if (!anteSat) {
    const { error } = await db
      .from('fel_documents')
      .update({
        estado: 'ANULADO',
        fecha_anulacion: new Date().toISOString(),
        motivo_anulacion: razon,
        anulado_por: auth.userId,
        proximo_intento: null,
      })
      .eq('id', documentId)
      .eq('restaurant_id', restaurantId);
    if (error) return { error: error.message };
    revalidatePath('/admin/facturacion');
    return { ok: true };
  }

  const horas = Number(settings?.horas_para_anular ?? 24);
  const ventana = ventanaDeAnulacion(doc.fecha_certificacion as string | null, horas);
  if (!ventana.puedeAnular) {
    return {
      error:
        `Ya pasaron las ${horas} horas en que el SAT permite anular esta factura. ` +
        'Para corregirla hay que emitir una nota de crédito, no anularla.',
    };
  }

  if (!adapter || !settings) {
    return {
      error: 'Esta factura está certificada ante el SAT y su certificador no está conectado en Leogin. ' +
        'Anúlala desde el portal de tu certificador para que quede anulada también ante el SAT.',
    };
  }

  let credentials;
  try {
    credentials = readCredentials(settings);
  } catch {
    return { error: 'No se pudieron leer las credenciales del certificador para anular.' };
  }

  const res = await adapter.anular({
    uuidOriginal: doc.uuid_sat as string,
    fechaEmisionOriginal: (doc.fecha_certificacion as string) ?? (doc.created_at as string),
    nitEmisor: settings.nit_emisor,
    idReceptor: doc.receptor_nit as string,
    motivo: razon,
    credentials,
    ambiente: settings.ambiente as FelAmbiente,
    idempotencyKey: documentId,
  });

  if (!res.ok) return { error: res.error };

  const { error } = await db
    .from('fel_documents')
    .update({
      estado: 'ANULADO',
      fecha_anulacion: res.fechaAnulacion,
      motivo_anulacion: razon,
      anulado_por: auth.userId,
      proximo_intento: null,
    })
    .eq('id', documentId)
    .eq('restaurant_id', restaurantId);
  if (error) return { error: error.message };

  revalidatePath('/admin/facturacion');
  return { ok: true };
}

/**
 * Emite una nota de crédito que revierte una factura ya certificada.
 *
 * Es el camino correcto cuando ya pasó la ventana de anulación: la factura
 * original sigue existiendo ante el SAT y la nota la compensa. Va con el
 * complemento que la ata al documento original, sin el cual el SAT no sabe
 * qué se está corrigiendo.
 */
export async function emitirNotaCredito(
  restaurantId: string,
  documentId: string,
  motivo: string,
): Promise<FelActionResult> {
  const auth = await authorizeFel(restaurantId);
  if ('error' in auth) return auth;

  const razon = motivo.trim();
  if (razon.length < 5) return { error: 'Escribe el motivo del ajuste: queda impreso en la nota de crédito.' };

  const db = createServiceClient();

  const { data: original } = await db
    .from('fel_documents')
    .select('*')
    .eq('id', documentId)
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  if (!original) return { error: 'Documento no encontrado.' };
  if (!original.es_fiscal) {
    return { error: 'Ese documento es un registro interno, no una factura del SAT. Anúlalo en vez de emitir una nota.' };
  }
  if (original.estado !== 'CERTIFICADO') {
    return { error: 'Solo se le puede emitir nota de crédito a una factura certificada.' };
  }
  if (original.tipo === 'NCRE') return { error: 'No se emite una nota de crédito sobre otra nota de crédito.' };

  const { data: yaTiene } = await db
    .from('fel_documents')
    .select('id')
    .eq('documento_origen_id', documentId)
    .neq('estado', 'ANULADO')
    .maybeSingle();
  if (yaTiene) return { error: 'Esa factura ya tiene una nota de crédito.' };

  const settings = await leerSettings(restaurantId);
  if (!settings) return { error: 'Falta la configuración fiscal.' };
  if (!getAdapter(settings.provider)) {
    return { error: `${PROVIDER_META[settings.provider].label} no está conectado en Leogin.` };
  }

  const dteOriginal = original.dte_json as { montos?: { lineas?: unknown[] } } | null;
  const lineas = (dteOriginal?.montos?.lineas ?? []) as Array<{
    descripcion: string; cantidad: number; total: number; bienOServicio?: 'B' | 'S';
  }>;
  if (lineas.length === 0) return { error: 'La factura original no tiene detalle para revertir.' };

  // Pasados dos meses desde la factura original, la nota de crédito no
  // lleva IVA (lo dice el propio esquema del complemento de referencia).
  const emision = new Date((original.fecha_certificacion as string) ?? (original.created_at as string));
  const dosMeses = (Date.now() - emision.getTime()) / 86_400_000 > 60;

  const armado = armarDocumento({
    settings,
    // Pasados dos meses, la nota no lleva IVA. No se falsea el régimen del
    // emisor para conseguirlo: el régimen es quién es el restaurante y no
    // cambia por la edad de una factura.
    sinIva: dosMeses,
    receptor: {
      id: { tipo: original.receptor_tipo_id as 'CF', valor: original.receptor_nit as string },
      nombre: original.receptor_nombre as string,
      correo: original.receptor_correo as string | null,
      direccion: original.receptor_direccion as string,
    },
    pedido: {
      lineas: lineas.map((l) => ({
        descripcion: l.descripcion,
        cantidad: l.cantidad,
        importe: l.total,
        bienOServicio: l.bienOServicio,
      })),
    },
    tipo: 'NCRE',
    referenciaNota: {
      numeroAutorizacionOrigen: (original.numero_autorizacion as string) ?? (original.uuid_sat as string),
      fechaEmisionOrigen: felDate(emision),
      serieOrigen: (original.serie as string) ?? '',
      numeroOrigen: (original.numero as string) ?? '',
      motivoAjuste: razon,
    },
  });

  if (armado.errores.length > 0) return { error: armado.errores[0] };

  const { data: nota, error: insErr } = await db.from('fel_documents').insert({
    restaurant_id: restaurantId,
    order_id: original.order_id,
    tipo: 'NCRE',
    documento_origen_id: documentId,
    receptor_nit: original.receptor_nit,
    receptor_tipo_id: original.receptor_tipo_id,
    receptor_nombre: original.receptor_nombre,
    receptor_direccion: original.receptor_direccion,
    receptor_correo: original.receptor_correo,
    moneda: armado.documento.moneda,
    monto_total: armado.montos.granTotal,
    monto_iva: armado.montos.totalImpuesto,
    provider: settings.provider,
    es_fiscal: true,
    origen: 'PANEL' as OrigenDocumento,
    emitido_por: auth.userId,
    motivo_anulacion: razon,
    estado: 'PENDIENTE',
    intentos: 0,
    dte_json: armado.documento as unknown as Record<string, unknown>,
  }).select('id').single();

  if (insErr) return { error: mensajeDeInsercion(insErr) };

  const trans = await transmitirDocumento(nota!.id as string);
  revalidatePath('/admin/facturacion');

  if (trans.estado === 'PENDIENTE') return { ok: true, documentId: nota!.id as string, aviso: trans.mensaje };
  if (!trans.ok) return { error: trans.mensaje, documentId: nota!.id as string };
  return { ok: true, documentId: nota!.id as string };
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
    .eq('id', documentId)
    .eq('restaurant_id', restaurantId);

  const res = await transmitirDocumento(documentId);
  revalidatePath('/admin/facturacion');

  if (res.estado === 'PENDIENTE') return { ok: true, aviso: res.mensaje };
  if (!res.ok) return { error: res.mensaje };
  return { ok: true };
}
