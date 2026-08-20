/* ============================================================
   TRANSMISIÓN AL CERTIFICADOR + COLA DE REINTENTOS
   ------------------------------------------------------------
   Orquesta lo que actions/fel.ts antes no hacía: tomar un documento
   PENDIENTE, armar el XML del SAT, mandarlo al certificador y anotar el
   resultado.

   ── Por qué el documento se crea ANTES de transmitir ──
   El orden es: guardar PENDIENTE → transmitir → marcar CERTIFICADO. Al
   revés (transmitir y guardar solo si sale bien) parece más limpio y es
   peor: si el proceso muere entre la respuesta del certificador y el
   insert, el SAT tiene una factura que Leogin no registró. Nadie la
   reimprime, nadie la cobra, y aparece en la declaración del mes como un
   documento fantasma. Guardando primero, el peor caso es un PENDIENTE que
   la cola reintenta — recuperable.

   ── Por qué backoff y no reintento inmediato ──
   Un certificador caído no se arregla porque le peguemos más rápido.
   1min → 5min → 15min → 1h → 6h da tiempo real a que vuelva, y el tope de
   intentos convierte un fallo permanente en un aviso al dueño en vez de
   un bucle infinito consumiendo cuota.
   ============================================================ */

import { createServiceClient } from '@/lib/supabase/service';
import { PROVIDER_META, type FelSettings } from '@/lib/fel';
import { buildDteXml, type DocumentoDte } from '@/lib/fel/xml';
import { readCredentials, hasCredentials } from '@/lib/fel/credentials';
import { getAdapter } from '@/lib/fel/providers/registry';
import type { FelAmbiente } from '@/lib/fel/providers/types';

/** Espera antes del intento n (1-indexado). El último valor se repite. */
const BACKOFF_MIN = [1, 5, 15, 60, 360];
export const MAX_INTENTOS = BACKOFF_MIN.length;

function proximoIntento(intentos: number): string {
  const min = BACKOFF_MIN[Math.min(intentos, BACKOFF_MIN.length - 1)];
  return new Date(Date.now() + min * 60_000).toISOString();
}

export interface TransmitResult {
  ok: boolean;
  /** Mensaje para el usuario. En el caso reintentable explica que quedó en cola. */
  mensaje: string;
  estado: 'CERTIFICADO' | 'PENDIENTE' | 'ERROR';
}

/**
 * Transmite un documento ya guardado como PENDIENTE.
 *
 * Idempotente por estado: si el documento ya está CERTIFICADO o ANULADO no
 * hace nada. Importa porque la cola y la emisión en vivo pueden coincidir
 * sobre la misma fila, y certificar dos veces le cobraría al restaurante
 * dos folios por una sola venta.
 */
export async function transmitirDocumento(documentId: string): Promise<TransmitResult> {
  const db = createServiceClient();

  const { data: doc } = await db
    .from('fel_documents')
    .select('*')
    .eq('id', documentId)
    .maybeSingle();

  if (!doc) return { ok: false, mensaje: 'Documento no encontrado.', estado: 'ERROR' };
  if (doc.estado === 'CERTIFICADO') {
    return { ok: true, mensaje: 'Ya estaba certificado.', estado: 'CERTIFICADO' };
  }
  if (doc.estado === 'ANULADO') {
    return { ok: false, mensaje: 'El documento está anulado.', estado: 'ERROR' };
  }

  const { data: settingsRow } = await db
    .from('fel_settings')
    .select('*')
    .eq('restaurant_id', doc.restaurant_id)
    .maybeSingle();

  if (!settingsRow) {
    return marcarError(documentId, 'Falta la configuración fiscal del restaurante.');
  }
  const settings = settingsRow as FelSettings;

  const adapter = getAdapter(settings.provider);
  if (!adapter) {
    return marcarError(
      documentId,
      `La transmisión con ${PROVIDER_META[settings.provider]?.label ?? settings.provider} todavía no está ` +
      'conectada en Leogin. Contacta a Leogin para activarla; mientras tanto este documento no se puede ' +
      'certificar ante el SAT.',
    );
  }

  if (!hasCredentials(settingsRow)) {
    return marcarError(
      documentId,
      'Faltan las credenciales del certificador. Complétalas en Facturación → Configuración.',
    );
  }

  let credentials;
  try {
    credentials = readCredentials(settingsRow);
  } catch (e) {
    // El descifrado falló: clave rotada o dato alterado. No es reintentable.
    return marcarError(
      documentId,
      'No se pudieron leer las credenciales del certificador (cifrado inválido). ' +
      'Vuelve a guardarlas en Facturación → Configuración.',
      e instanceof Error ? e.message : String(e),
    );
  }

  // El DTE se reconstruye del snapshot, NO se recalcula: los precios de la
  // venta ya ocurrieron y un reintento mañana no puede facturar otro monto
  // porque entretanto cambió la carta — ni otras frases porque el dueño
  // tocó su configuración fiscal entre el cobro y el reintento.
  const dte = doc.dte_json as DocumentoDte | null;
  if (!dte?.montos || !Array.isArray(dte.montos.lineas) || dte.montos.lineas.length === 0) {
    return marcarError(documentId, 'El documento no tiene un DTE válido guardado.');
  }

  const xml = buildDteXml(dte);

  // Se archiva lo que se manda, antes de mandarlo: si el SAT lo rechaza,
  // el diagnóstico se hace mirando el documento real y no reconstruyéndolo
  // de memoria.
  await db.from('fel_documents').update({ xml_enviado: xml }).eq('id', documentId);

  const res = await adapter.certificar({
    xml,
    credentials,
    ambiente: settings.ambiente as FelAmbiente,
    nitEmisor: settings.nit_emisor,
    // El id del documento no cambia entre reintentos: es lo que impide que
    // un timeout convierta una venta en dos facturas ante el SAT.
    idempotencyKey: documentId,
  });

  if (res.ok) {
    await db
      .from('fel_documents')
      .update({
        estado: 'CERTIFICADO',
        uuid_sat: res.uuid,
        serie: res.serie || null,
        numero: res.numero || null,
        numero_autorizacion: res.numeroAutorizacion || res.uuid,
        fecha_certificacion: res.fechaCertificacion,
        xml_certificado: res.xmlCertificado,
        error_mensaje: null,
        ultimo_error: null,
        proximo_intento: null,
      })
      .eq('id', documentId);

    return { ok: true, mensaje: 'Factura certificada por el SAT.', estado: 'CERTIFICADO' };
  }

  const intentos = Number(doc.intentos ?? 0) + 1;
  const seRinde = !res.reintentable || intentos >= MAX_INTENTOS;

  if (seRinde) {
    return marcarError(documentId, res.error, res.detalle, intentos);
  }

  await db
    .from('fel_documents')
    .update({
      estado: 'PENDIENTE',
      intentos,
      ultimo_error: res.detalle ?? res.error,
      error_mensaje: res.error,
      proximo_intento: proximoIntento(intentos),
    })
    .eq('id', documentId);

  return {
    ok: false,
    estado: 'PENDIENTE',
    mensaje: `${res.error} Queda en cola y se reintenta automáticamente (intento ${intentos} de ${MAX_INTENTOS}).`,
  };
}

async function marcarError(
  documentId: string,
  mensaje: string,
  detalle?: string,
  intentos?: number,
): Promise<TransmitResult> {
  const db = createServiceClient();
  await db
    .from('fel_documents')
    .update({
      estado: 'ERROR',
      error_mensaje: mensaje,
      ultimo_error: detalle ?? mensaje,
      proximo_intento: null,
      ...(intentos !== undefined ? { intentos } : {}),
    })
    .eq('id', documentId);

  return { ok: false, mensaje, estado: 'ERROR' };
}

/**
 * Procesa los documentos cuyo reintento ya venció.
 *
 * El límite por corrida evita que un pico (certificador caído toda la
 * noche) convierta la siguiente ejecución en una tormenta de peticiones.
 * Lo que no entre queda para la corrida siguiente: la cola no se pierde.
 */
export async function procesarColaFel(limite = 25): Promise<{ procesados: number; certificados: number }> {
  const db = createServiceClient();

  const { data: pendientes } = await db
    .from('fel_documents')
    .select('id')
    .eq('estado', 'PENDIENTE')
    .not('proximo_intento', 'is', null)
    .lte('proximo_intento', new Date().toISOString())
    .order('proximo_intento', { ascending: true })
    .limit(limite);

  const filas = pendientes ?? [];
  let certificados = 0;

  // En serie a propósito: en paralelo se le pegaría al certificador con
  // 25 peticiones simultáneas justo cuando se está recuperando de estar caído.
  for (const row of filas) {
    const r = await transmitirDocumento(row.id as string);
    if (r.ok) certificados++;
  }

  return { procesados: filas.length, certificados };
}
