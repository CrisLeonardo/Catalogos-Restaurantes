/* ============================================================
   ADAPTADOR INFILE · certificador FEL (Guatemala)
   ------------------------------------------------------------
   INFILE es el certificador más común en Guatemala y por eso es el primero
   del plan. Su flujo son DOS llamadas, no una:

     1. FIRMA        el XML del DTE se manda al firmador y vuelve firmado
     2. CERTIFICACIÓN el XML firmado se manda al certificador, que valida,
                      lo transmite al SAT y devuelve el UUID de autorización

   Saltarse el paso 1 no funciona: el certificador rechaza un DTE sin firma.

   ── QUÉ ESTÁ CONFIRMADO Y QUÉ NO ──
   Los dos endpoints están verificados contra integraciones públicas
   existentes. Los NOMBRES DE CAMPO del JSON no pude verificarlos en fuente
   oficial: vienen del contrato que INFILE entrega en el onboarding, y ese
   documento no es público.

   Por eso todo lo incierto está aislado en el bloque CONTRATO de abajo, y
   la lectura de respuestas es tolerante (acepta varios nombres para el
   mismo dato). Si al conectar la cuenta real algo no cuadra, se corrige en
   un solo lugar sin tocar la lógica de emisión, la cola de reintentos ni
   la UI. Ninguna de esas tres depende de estos nombres.

   ⚠️ Antes de facturar en PRODUCCIÓN: contrastar este bloque con el PDF de
   integración de INFILE y probar en su ambiente de pruebas.
   ============================================================ */

import {
  fetchConTimeout,
  errorDeRed,
  type FelProviderAdapter,
  type CertificarInput,
  type CertificarResult,
  type AnularInput,
  type AnularResult,
} from './types';
import { buildAnulacionXml } from '@/lib/fel/xml';

/* ── CONTRATO (lo que hay que verificar con INFILE) ──────────── */

const ENDPOINT_FIRMA =
  process.env.FEL_INFILE_URL_FIRMA ||
  'https://signer-emisores.feel.com.gt/sign_solicitud_firmas/firma_xml';

const ENDPOINT_CERTIFICACION =
  process.env.FEL_INFILE_URL_CERTIFICACION ||
  'https://certificador.feel.com.gt/fel/certificacion/v2/dte/';

/**
 * INFILE no separa pruebas y producción por URL sino por credenciales: la
 * cuenta de pruebas apunta a los mismos servicios y sus documentos no
 * llegan al SAT. Las variables de entorno están por si eso cambia o si el
 * onboarding entrega hosts distintos.
 */
function endpoints() {
  return { firma: ENDPOINT_FIRMA, certificacion: ENDPOINT_CERTIFICACION };
}

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
const deB64 = (s: string) => Buffer.from(s, 'base64').toString('utf8');

/** Lee el primer campo presente. Absorbe diferencias de nombre entre versiones. */
function pick(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === 'string' && v.trim() !== '') return v;
    if (typeof v === 'number') return String(v);
  }
  return '';
}

/**
 * ¿La respuesta dice que salió bien?
 *
 * Se exige una señal explícita de éxito: un JSON inesperado no se interpreta
 * como "certificó". Dar por buena una factura que nunca llegó al SAT es el
 * peor error posible aquí — el restaurante creería estar al día y no lo está.
 */
function esExito(json: Record<string, unknown>): boolean {
  const r = json?.resultado ?? json?.Resultado ?? json?.success;
  return r === true || r === 'true' || r === 1;
}

/** Junta los mensajes de error que INFILE devuelve en varias formas. */
function mensajeError(json: Record<string, unknown>): string {
  const errores = json?.descripcion_errores ?? json?.errores ?? json?.Errores;
  if (Array.isArray(errores) && errores.length > 0) {
    return errores
      .map((e) =>
        typeof e === 'string'
          ? e
          : pick(e as Record<string, unknown>, 'mensaje_error', 'mensaje', 'descripcion', 'error'),
      )
      .filter(Boolean)
      .join(' · ');
  }
  return (
    pick(json, 'descripcion', 'mensaje', 'message', 'error') ||
    'El certificador rechazó el documento sin indicar el motivo.'
  );
}

/**
 * Un rechazo de negocio no se reintenta; un problema de infraestructura sí.
 * Ante la duda, reintentable (ver la nota en types.ts).
 */
function esReintentable(status: number): boolean {
  if (status >= 500) return true;   // el certificador está mal
  if (status === 408 || status === 429) return true; // timeout / saturado
  if (status === 401 || status === 403) return false; // credenciales: no mejora solo
  if (status >= 400) return false;  // rechazo del documento
  return true;
}

/* ── Paso 1: firma ───────────────────────────────────────────── */

async function firmarXml(
  xml: string,
  llaveFirma: string,
  alias: string,
  identificador: string,
  esAnulacion = false,
): Promise<{ ok: true; xmlFirmado: string } | { ok: false; error: string; reintentable: boolean; detalle?: string }> {
  let res: Response;
  try {
    res = await fetchConTimeout(endpoints().firma, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        llave: llaveFirma,
        archivo: b64(xml),
        codigo: identificador,
        alias,
        es_anulacion: esAnulacion ? 'S' : 'N',
      }),
    });
  } catch (e) {
    const f = errorDeRed(e);
    return { ok: false, error: f.error, reintentable: true, detalle: f.detalle };
  }

  const texto = await res.text();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(texto) as Record<string, unknown>;
  } catch {
    return {
      ok: false,
      reintentable: esReintentable(res.status),
      error: 'El servicio de firma respondió algo que no se pudo interpretar.',
      detalle: `HTTP ${res.status}: ${texto.slice(0, 500)}`,
    };
  }

  if (!res.ok || !esExito(json)) {
    return {
      ok: false,
      reintentable: esReintentable(res.status),
      error: `No se pudo firmar el documento: ${mensajeError(json)}`,
      detalle: texto.slice(0, 1000),
    };
  }

  const firmado = pick(json, 'archivo', 'xml_firmado', 'archivo_firmado');
  if (!firmado) {
    return {
      ok: false,
      reintentable: false,
      error: 'El servicio de firma no devolvió el documento firmado.',
      detalle: texto.slice(0, 1000),
    };
  }

  // INFILE devuelve el firmado en base64; si algún día llega en claro, se usa tal cual.
  const xmlFirmado = firmado.trimStart().startsWith('<') ? firmado : deB64(firmado);
  return { ok: true, xmlFirmado };
}

/* ── Paso 2: certificación ───────────────────────────────────── */

export async function certificar(input: CertificarInput): Promise<CertificarResult> {
  const { credentials, nitEmisor, xml } = input;

  // Identificador único de la solicitud: permite a INFILE deduplicar si un
  // reintento nuestro llega después de que ellos ya procesaron el original.
  const identificador = `LEOGIN-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const firma = await firmarXml(xml, credentials.llaveFirma, credentials.usuario, identificador);
  if (!firma.ok) {
    return { ok: false, error: firma.error, reintentable: firma.reintentable, detalle: firma.detalle };
  }

  let res: Response;
  try {
    res = await fetchConTimeout(endpoints().certificacion, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        UsuarioApi: credentials.usuario,
        LlaveApi: credentials.clave,
        UsuarioFirma: credentials.usuario,
        LlaveFirma: credentials.llaveFirma,
        identificador,
      },
      body: JSON.stringify({
        nit_emisor: nitEmisor,
        correo_copia: '',
        xml_dte: b64(firma.xmlFirmado),
      }),
    });
  } catch (e) {
    return errorDeRed(e);
  }

  const texto = await res.text();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(texto) as Record<string, unknown>;
  } catch {
    return {
      ok: false,
      reintentable: esReintentable(res.status),
      error: 'El certificador respondió algo que no se pudo interpretar.',
      detalle: `HTTP ${res.status}: ${texto.slice(0, 500)}`,
    };
  }

  if (!res.ok || !esExito(json)) {
    return {
      ok: false,
      reintentable: esReintentable(res.status),
      error: mensajeError(json),
      detalle: texto.slice(0, 1000),
    };
  }

  const uuid = pick(json, 'uuid', 'Uuid', 'numero_autorizacion');
  if (!uuid) {
    // Sin UUID no hay factura: no se puede dar por certificado.
    return {
      ok: false,
      reintentable: true,
      error: 'El certificador respondió correctamente pero sin número de autorización.',
      detalle: texto.slice(0, 1000),
    };
  }

  const certificado = pick(json, 'xml_certificado', 'xml_dte_certificado', 'archivo');

  return {
    ok: true,
    uuid,
    serie: pick(json, 'serie', 'Serie'),
    numero: pick(json, 'numero', 'Numero'),
    numeroAutorizacion: pick(json, 'numero_autorizacion', 'uuid'),
    fechaCertificacion: pick(json, 'fecha', 'fecha_certificacion') || new Date().toISOString(),
    xmlCertificado: certificado
      ? (certificado.trimStart().startsWith('<') ? certificado : deB64(certificado))
      : firma.xmlFirmado,
  };
}

/* ── Anulación ───────────────────────────────────────────────── */

export async function anular(input: AnularInput): Promise<AnularResult> {
  const { credentials, nitEmisor } = input;
  const identificador = `LEOGIN-ANU-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const xml = buildAnulacionXml({
    uuidOriginal: input.uuidOriginal,
    fechaEmisionOriginal: input.fechaEmisionOriginal,
    nitEmisor,
    idReceptor: input.idReceptor,
    motivo: input.motivo,
  });

  const firma = await firmarXml(xml, credentials.llaveFirma, credentials.usuario, identificador, true);
  if (!firma.ok) {
    return { ok: false, error: firma.error, reintentable: firma.reintentable, detalle: firma.detalle };
  }

  let res: Response;
  try {
    res = await fetchConTimeout(endpoints().certificacion, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        UsuarioApi: credentials.usuario,
        LlaveApi: credentials.clave,
        UsuarioFirma: credentials.usuario,
        LlaveFirma: credentials.llaveFirma,
        identificador,
      },
      body: JSON.stringify({
        nit_emisor: nitEmisor,
        correo_copia: '',
        xml_dte: b64(firma.xmlFirmado),
      }),
    });
  } catch (e) {
    const f = errorDeRed(e);
    return { ok: false, error: f.error, reintentable: true, detalle: f.detalle };
  }

  const texto = await res.text();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(texto) as Record<string, unknown>;
  } catch {
    return {
      ok: false,
      reintentable: esReintentable(res.status),
      error: 'El certificador respondió algo que no se pudo interpretar al anular.',
      detalle: `HTTP ${res.status}: ${texto.slice(0, 500)}`,
    };
  }

  if (!res.ok || !esExito(json)) {
    return {
      ok: false,
      reintentable: esReintentable(res.status),
      error: mensajeError(json),
      detalle: texto.slice(0, 1000),
    };
  }

  return {
    ok: true,
    fechaAnulacion: pick(json, 'fecha', 'fecha_anulacion') || new Date().toISOString(),
    xmlCertificado: firma.xmlFirmado,
  };
}

export const infileAdapter: FelProviderAdapter = {
  key: 'INFILE',
  label: 'INFILE',
  certificar,
  anular,
};
