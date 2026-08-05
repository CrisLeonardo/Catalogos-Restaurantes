/* ============================================================
   FEL — Factura Electrónica en Línea (Guatemala) · lógica pura
   ------------------------------------------------------------
   Sin dependencias de React/DB: genera el DTE (Documento Tributario
   Electrónico) y calcula el IVA. La persistencia y la transmisión al
   certificador viven en src/lib/actions/fel.ts.

   IVA Guatemala = 12 %. Por defecto los precios INCLUYEN IVA, así que
   el monto gravable (base) = total / 1.12 y el IVA = total − base.
   ============================================================ */

export const IVA_RATE = 0.12;

export type FelProvider = 'MANUAL' | 'INFILE' | 'G4S' | 'DIGIFACT' | 'OTRO';

export interface FelSettings {
  restaurant_id: string;
  provider: FelProvider;
  ambiente: 'PRUEBAS' | 'PRODUCCION';
  nit_emisor: string;
  nombre_emisor: string;
  nombre_comercial: string;
  direccion: string;
  codigo_establecimiento: string;
  afiliacion_iva: 'GEN' | 'PEQ';
  moneda: string;
  iva_incluido: boolean;
  serie_prefijo: string;
  api_usuario: string;
  /** @deprecated Texto plano heredado. Leer con readCredentials() (migración 106). */
  api_clave: string;
  /** @deprecated Texto plano heredado. Leer con readCredentials() (migración 106). */
  api_llave_firma: string;
  /** Cifrados con la caja fuerte (migración 106). Nunca viajan al cliente. */
  api_clave_cipher?: string | null;
  api_llave_firma_cipher?: string | null;
  /**
   * Si ya hay credencial guardada, sin revelarla. Es lo único que la UI
   * necesita saber: permite mostrar "ya configurada" y dejar el campo vacío
   * para no reenviar el secreto al navegador en cada carga de la página.
   */
  tiene_clave?: boolean;
  tiene_llave_firma?: boolean;
  /** Dirección fiscal que exige el esquema del SAT (migración 106). */
  codigo_postal: string;
  municipio: string;
  departamento: string;
  pais: string;
  next_correlativo: number;
  updated_at: string;
}

export interface FelDocument {
  id: string;
  restaurant_id: string;
  order_id: string | null;
  tipo: string;
  receptor_nit: string;
  receptor_nombre: string;
  receptor_direccion: string;
  moneda: string;
  monto_total: number;
  monto_iva: number;
  estado: 'PENDIENTE' | 'CERTIFICADO' | 'ANULADO' | 'ERROR';
  uuid_sat: string | null;
  serie: string | null;
  numero: string | null;
  numero_autorizacion: string | null;
  fecha_certificacion: string | null;
  error_mensaje: string | null;
  dte_json: unknown;
  created_at: string;
  /** Cola de reintentos (migración 106). */
  intentos?: number;
  ultimo_error?: string | null;
  proximo_intento?: string | null;
  /** DTE firmado y certificado: el documento con validez legal. */
  xml_certificado?: string | null;
  fecha_anulacion?: string | null;
  motivo_anulacion?: string | null;
}

export interface Receptor {
  nit: string;        // 'CF' para consumidor final
  nombre: string;
  direccion: string;
}

export interface DteLine {
  cantidad: number;
  descripcion: string;
  precioUnitario: number;   // con IVA incluido (si iva_incluido)
  total: number;            // cantidad * precioUnitario
  montoGravable: number;    // base sin IVA
  montoImpuesto: number;    // IVA de la línea
}

export interface FacturaDte {
  tipo: 'FACT';
  fechaEmision: string;
  moneda: string;
  emisor: {
    nit: string;
    nombre: string;
    nombreComercial: string;
    direccion: string;
    codigoEstablecimiento: string;
    afiliacionIVA: string;
  };
  receptor: Receptor;
  items: DteLine[];
  granTotal: number;
  totalGravable: number;
  totalImpuesto: number;
}

export interface FelLineInput {
  descripcion: string;
  cantidad: number;
  /** Precio total de la línea (cantidad × unitario), con IVA incluido. */
  total: number;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Desglosa una línea en base gravable + IVA según si el precio lo incluye. */
export function splitIva(total: number, ivaIncluido: boolean): { gravable: number; impuesto: number } {
  if (ivaIncluido) {
    const gravable = round2(total / (1 + IVA_RATE));
    return { gravable, impuesto: round2(total - gravable) };
  }
  const impuesto = round2(total * IVA_RATE);
  return { gravable: round2(total), impuesto };
}

/** Construye el DTE de una factura a partir de líneas + datos del emisor/receptor. */
export function buildFacturaDte(
  settings: FelSettings,
  receptor: Receptor,
  lines: FelLineInput[],
): FacturaDte {
  const items: DteLine[] = lines.map((l) => {
    const total = round2(l.total);
    const { gravable, impuesto } = splitIva(total, settings.iva_incluido);
    const cantidad = l.cantidad > 0 ? l.cantidad : 1;
    return {
      cantidad,
      descripcion: l.descripcion,
      precioUnitario: round2(total / cantidad),
      total,
      montoGravable: gravable,
      montoImpuesto: impuesto,
    };
  });

  const granTotal = round2(items.reduce((a, i) => a + i.total, 0));
  const totalGravable = round2(items.reduce((a, i) => a + i.montoGravable, 0));
  const totalImpuesto = round2(items.reduce((a, i) => a + i.montoImpuesto, 0));

  return {
    tipo: 'FACT',
    fechaEmision: new Date().toISOString(),
    moneda: settings.moneda || 'GTQ',
    emisor: {
      nit: settings.nit_emisor,
      nombre: settings.nombre_emisor,
      nombreComercial: settings.nombre_comercial || settings.nombre_emisor,
      direccion: settings.direccion,
      codigoEstablecimiento: settings.codigo_establecimiento || '1',
      afiliacionIVA: settings.afiliacion_iva,
    },
    receptor,
    items,
    granTotal,
    totalGravable,
    totalImpuesto,
  };
}

export const PROVIDER_META: Record<FelProvider, { label: string; transmits: boolean; note: string }> = {
  MANUAL:   { label: 'Manual (registro interno)', transmits: false, note: 'Numeración interna secuencial, sin transmisión al SAT. Útil mientras contratas un certificador.' },
  INFILE:   { label: 'INFILE',   transmits: true,  note: 'Certificador. Requiere usuario, clave y llave de firma de tu cuenta INFILE.' },
  G4S:      { label: 'G4S / efactura', transmits: true, note: 'Certificador. Requiere credenciales de tu cuenta.' },
  DIGIFACT: { label: 'Digifact', transmits: true,  note: 'Certificador. Requiere credenciales de tu cuenta.' },
  OTRO:     { label: 'Otro certificador', transmits: true, note: 'Integración a medida. Contacta a Leogin para conectarlo.' },
};

/** Normaliza un NIT (mayúsculas, sin guiones/espacios). 'CF' = consumidor final. */
export function normalizeNit(raw: string): string {
  const v = (raw || '').trim().toUpperCase().replace(/[\s-]/g, '');
  return v === '' ? 'CF' : v;
}

/** Validación básica de NIT guatemalteco (o 'CF'). No sustituye la del SAT. */
export function isValidNit(raw: string): boolean {
  const nit = normalizeNit(raw);
  if (nit === 'CF') return true;
  return /^[0-9]+K?$/.test(nit) && nit.length >= 4;
}
