/* ============================================================
   FEL — Factura Electrónica en Línea (Guatemala) · tipos y armado
   ------------------------------------------------------------
   Punto de entrada del módulo. Aquí viven los tipos que cruzan capas y
   la función que junta configuración + pedido + receptor en un documento
   listo para serializar.

   El trabajo fiscal de verdad está repartido en piezas puras y probadas:
     · fel/nit.ts      — quién es el receptor (NIT, DPI, CF, extranjero)
     · fel/frases.ts   — qué leyendas legales lleva según el régimen
     · fel/totales.ts  — cuánto se factura y cómo cuadra con la caja
     · fel/xml.ts      — cómo se serializa para el SAT

   Ninguna de esas depende de la base ni de la red, así que el cálculo de
   una factura se puede probar entero sin tocar un certificador. Este
   archivo es el pegamento, y a propósito no hace aritmética propia.
   ============================================================ */

import {
  frasesPara,
  afiliacionIvaXml,
  tipoDteDeRegimen,
  desglosaIva,
  problemasDeConfiguracion,
  type ConfigFiscal,
  type RegimenIva,
  type RegimenIsr,
} from '@/lib/fel/frases';
import { calcularMontos, verificarMontos, type PedidoParaFacturar, type OpcionesMontos, type MontosDte } from '@/lib/fel/totales';
import { esNitValido, type ReceptorId } from '@/lib/fel/nit';
import type { DocumentoDte, DireccionFiscal, ReferenciaNota, TipoDte } from '@/lib/fel/xml';

export { IVA_RATE } from '@/lib/fel/totales';

export type FelProvider = 'MANUAL' | 'INFILE' | 'G4S' | 'DIGIFACT' | 'OTRO';

/** Cómo se identificó al receptor. Refleja receptor_tipo_id en la base. */
export type TipoIdReceptor = ReceptorId['tipo'];

/** De dónde salió el documento. Sirve para investigar cuando algo no cuadra. */
export type OrigenDocumento = 'PANEL' | 'CAJA' | 'API';

export interface FelSettings {
  restaurant_id: string;
  provider: FelProvider;
  ambiente: 'PRUEBAS' | 'PRODUCCION';

  /* Emisor */
  nit_emisor: string;
  nombre_emisor: string;
  nombre_comercial: string;
  correo_emisor: string | null;
  direccion: string;
  codigo_postal: string;
  municipio: string;
  departamento: string;
  pais: string;
  codigo_establecimiento: string;

  /* Régimen fiscal (migración 118) */
  regimen_iva: RegimenIva;
  regimen_isr: RegimenIsr;
  agente_retencion_iva: boolean;
  numero_resolucion: string | null;
  fecha_resolucion: string | null;
  /** @deprecated Sustituido por regimen_iva. Se conserva por filas viejas. */
  afiliacion_iva?: 'GEN' | 'PEQ';

  /* Comportamiento */
  moneda: string;
  iva_incluido: boolean;
  emision_automatica: boolean;
  facturar_propina: boolean;
  tope_consumidor_final: number;
  horas_para_anular: number;
  serie_prefijo: string;

  /* Credenciales — nunca viajan al navegador */
  api_usuario: string;
  /** @deprecated Texto plano heredado. Leer con readCredentials() (migración 106). */
  api_clave: string;
  /** @deprecated Texto plano heredado. Leer con readCredentials() (migración 106). */
  api_llave_firma: string;
  api_clave_cipher?: string | null;
  api_llave_firma_cipher?: string | null;
  /** Si ya hay credencial guardada, sin revelarla. Es lo único que la UI necesita. */
  tiene_clave?: boolean;
  tiene_llave_firma?: boolean;

  next_correlativo: number;
  updated_at: string;
}

export interface FelDocument {
  id: string;
  restaurant_id: string;
  order_id: string | null;
  tipo: string;
  receptor_nit: string;
  receptor_tipo_id: TipoIdReceptor;
  receptor_nombre: string;
  receptor_direccion: string;
  receptor_correo: string | null;
  moneda: string;
  monto_total: number;
  monto_iva: number;
  propina_excluida: number;
  estado: 'PENDIENTE' | 'CERTIFICADO' | 'ANULADO' | 'ERROR';
  /**
   * ¿Vale ante el SAT? Se congela al emitir en vez de deducirse del
   * proveedor actual: el restaurante puede cambiar de certificador y el
   * historial tiene que seguir diciendo la verdad sobre cada documento.
   */
  es_fiscal: boolean;
  provider: FelProvider | null;
  origen: OrigenDocumento;
  uuid_sat: string | null;
  serie: string | null;
  numero: string | null;
  numero_autorizacion: string | null;
  fecha_certificacion: string | null;
  error_mensaje: string | null;
  dte_json: unknown;
  created_at: string;
  intentos?: number;
  ultimo_error?: string | null;
  proximo_intento?: string | null;
  xml_enviado?: string | null;
  xml_certificado?: string | null;
  fecha_anulacion?: string | null;
  motivo_anulacion?: string | null;
  documento_origen_id?: string | null;
  emitido_por?: string | null;
  anulado_por?: string | null;
}

export const PROVIDER_META: Record<FelProvider, { label: string; transmits: boolean; note: string }> = {
  MANUAL:   { label: 'Sin certificador (registro interno)', transmits: false, note: 'Numera las ventas dentro de Leogin pero NO emite factura ante el SAT. Sirve para ordenarte mientras contratas un certificador; estos documentos no tienen validez fiscal.' },
  INFILE:   { label: 'INFILE',              transmits: true, note: 'Certificador. Requiere usuario, clave y llave de firma de tu cuenta INFILE.' },
  G4S:      { label: 'G4S / efactura',      transmits: true, note: 'Certificador. Aún no está conectado en Leogin.' },
  DIGIFACT: { label: 'Digifact',            transmits: true, note: 'Certificador. Aún no está conectado en Leogin.' },
  OTRO:     { label: 'Otro certificador',   transmits: true, note: 'Integración a medida. Contacta a Leogin para conectarlo.' },
};

/* ── Derivaciones desde la configuración ────────────────────── */

export function configFiscalDe(s: FelSettings): ConfigFiscal {
  return {
    regimenIva: s.regimen_iva,
    regimenIsr: s.regimen_isr,
    agenteRetencionIva: s.agente_retencion_iva,
    numeroResolucion: s.numero_resolucion,
    fechaResolucion: s.fecha_resolucion,
  };
}

export function opcionesMontosDe(s: FelSettings): OpcionesMontos {
  return {
    ivaIncluido: s.iva_incluido,
    desglosaIva: desglosaIva(s.regimen_iva),
    facturarPropina: s.facturar_propina,
  };
}

export function direccionFiscalDe(s: FelSettings): DireccionFiscal {
  return {
    direccion: s.direccion || 'Ciudad',
    codigoPostal: s.codigo_postal || '01001',
    municipio: s.municipio || 'Guatemala',
    departamento: s.departamento || 'Guatemala',
    pais: s.pais || 'GT',
  };
}

/* ── Comprobaciones previas ─────────────────────────────────── */

/**
 * Todo lo que impide facturar, dicho antes de que haya un cliente
 * esperando.
 *
 * Un rechazo del certificador llega como un código del SAT en mitad del
 * cobro. Esta lista existe para que ese momento no ocurra: se enseña en
 * la pantalla de configuración, no en la caja.
 */
export function problemasParaEmitir(s: FelSettings): string[] {
  const problemas: string[] = [];

  if (!s.nit_emisor) problemas.push('Falta el NIT del emisor.');
  else if (!esNitValido(s.nit_emisor)) problemas.push('El NIT del emisor no es válido. Revísalo en tu constancia del RTU.');

  if (!s.nombre_emisor.trim()) problemas.push('Falta el nombre o razón social del emisor.');
  if (!s.direccion.trim()) problemas.push('Falta la dirección fiscal del emisor.');
  if (!s.municipio.trim() || !s.departamento.trim()) {
    problemas.push('Faltan municipio y departamento: el SAT los exige y deben coincidir con el domicilio fiscal de tu NIT.');
  }
  if (!s.codigo_establecimiento.trim()) {
    problemas.push('Falta el código de establecimiento (normalmente 1).');
  }

  problemas.push(...problemasDeConfiguracion(configFiscalDe(s)));
  return problemas;
}

/**
 * ¿Se puede facturar esto como consumidor final?
 *
 * Desde enero 2023 el SAT no lo permite arriba del tope (Q2,500) y multa
 * con Q100 cada documento mal emitido. La comprobación va aquí, antes de
 * transmitir, porque después del rechazo el cliente ya se fue y quien
 * paga la multa es el restaurante.
 */
export function problemaDeConsumidorFinal(
  receptor: ReceptorId,
  granTotal: number,
  tope: number,
): string | null {
  if (receptor.tipo !== 'CF') return null;
  if (granTotal <= tope) return null;
  return (
    `Una venta de Q${granTotal.toFixed(2)} no se puede facturar como Consumidor Final: ` +
    `arriba de Q${tope.toFixed(2)} el SAT exige el NIT o el DPI del cliente ` +
    '(son Q100 de multa por cada factura mal emitida). Pídele el NIT o su DPI.'
  );
}

/* ── Armado del documento ───────────────────────────────────── */

export interface ReceptorFactura {
  id: ReceptorId;
  nombre: string;
  correo?: string | null;
  direccion?: string | null;
}

export interface DocumentoArmado {
  documento: DocumentoDte;
  montos: MontosDte;
  tipo: TipoDte;
  /** Si trae algo, NO se emite. Son mensajes para mostrar tal cual. */
  errores: string[];
}

/**
 * Junta configuración, receptor y pedido en un documento listo para XML.
 *
 * Devuelve `errores` en vez de lanzar porque quien llama está en mitad de
 * un cobro y necesita poder enseñar el motivo, no reventar.
 */
export function armarDocumento(params: {
  settings: FelSettings;
  receptor: ReceptorFactura;
  pedido: PedidoParaFacturar;
  /** Por defecto se deduce del régimen. Una nota de crédito lo fuerza. */
  tipo?: TipoDte;
  referenciaNota?: ReferenciaNota;
  fechaEmision?: string;
  /**
   * Fuerza el documento sin desglose de IVA.
   *
   * Lo necesita la nota de crédito emitida más de dos meses después de la
   * factura original: el esquema del complemento de referencia lo exige.
   * Es una propiedad de ESE documento, no del régimen del emisor — por eso
   * es una opción aquí y no un cambio en la configuración.
   */
  sinIva?: boolean;
}): DocumentoArmado {
  const { settings, receptor, pedido } = params;
  const tipo = params.tipo ?? tipoDteDeRegimen(settings.regimen_iva);
  const conIva = desglosaIva(settings.regimen_iva) && !params.sinIva;

  const errores = [...problemasParaEmitir(settings)];
  const montos = calcularMontos(pedido, { ...opcionesMontosDe(settings), desglosaIva: conIva });
  errores.push(...montos.errores);

  // Red independiente del cálculo: comprueba las igualdades que el
  // certificador va a comprobar, por si alguien toca totales.ts mañana.
  if (montos.errores.length === 0) {
    errores.push(...verificarMontos(montos, conIva));
  }

  const topeCf = problemaDeConsumidorFinal(receptor.id, montos.granTotal, Number(settings.tope_consumidor_final) || 2500);
  if (topeCf) errores.push(topeCf);

  if (tipo === 'NCRE' && !params.referenciaNota) {
    errores.push('Una nota de crédito necesita la factura que corrige.');
  }

  const documento: DocumentoDte = {
    tipo,
    fechaEmision: params.fechaEmision ?? new Date().toISOString(),
    moneda: settings.moneda || 'GTQ',
    emisor: {
      nit: settings.nit_emisor,
      nombre: settings.nombre_emisor,
      nombreComercial: settings.nombre_comercial || settings.nombre_emisor,
      codigoEstablecimiento: settings.codigo_establecimiento || '1',
      afiliacionIva: afiliacionIvaXml(settings.regimen_iva),
      correo: settings.correo_emisor,
      direccion: direccionFiscalDe(settings),
    },
    receptor: {
      id: receptor.id,
      nombre: receptor.nombre || 'Consumidor Final',
      correo: receptor.correo,
      direccion: { direccion: receptor.direccion || 'Ciudad' },
    },
    frases: frasesPara(configFiscalDe(settings)),
    montos,
    desglosaIva: conIva,
    referenciaNota: params.referenciaNota,
  };

  return { documento, montos, tipo, errores };
}

/**
 * ¿Todavía se puede anular ante el SAT, o toca nota de crédito?
 *
 * El SAT solo admite la anulación dentro de una ventana corta desde la
 * emisión. Pasada, el documento sigue vivo y la única corrección válida
 * es una nota de crédito. Marcar la fila como anulada en Leogin sin poder
 * anularla de verdad es el peor resultado posible: el restaurante creería
 * que ya no debe esa factura y la seguiría debiendo.
 */
export function ventanaDeAnulacion(
  fechaCertificacion: string | null,
  horas: number,
  ahora: Date = new Date(),
): { puedeAnular: boolean; horasRestantes: number } {
  if (!fechaCertificacion) return { puedeAnular: true, horasRestantes: horas };
  const transcurridas = (ahora.getTime() - new Date(fechaCertificacion).getTime()) / 3_600_000;
  const restantes = horas - transcurridas;
  return { puedeAnular: restantes > 0, horasRestantes: Math.max(0, restantes) };
}
