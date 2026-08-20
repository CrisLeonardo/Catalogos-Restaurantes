import { createServiceClient } from '@/lib/supabase/service';
import { problemasParaEmitir, type FelSettings, type FelDocument, type FelProvider } from '@/lib/fel';
import { textosDeFrases, type ConfigFiscal } from '@/lib/fel/frases';
import { configFiscalDe } from '@/lib/fel';

/**
 * Config FEL del restaurante, con defaults si aún no existe fila.
 *
 * ⚠️ SIN CREDENCIALES. Lo que devuelve esta función alimenta un componente
 * cliente, así que la clave y la llave de firma salen vacías y solo se
 * informa si existen (`tiene_clave` / `tiene_llave_firma`). Antes de la
 * migración 106 viajaban en claro al navegador y se pintaban en los inputs;
 * bastaba abrir las herramientas de desarrollo para leer las llaves con las
 * que se factura a nombre del restaurante.
 *
 * Quien necesite las credenciales de verdad (la transmisión) las lee de la
 * base con readCredentials(), en el servidor.
 */
export async function getFelSettings(restaurantId: string): Promise<FelSettings> {
  const db = createServiceClient();
  const { data } = await db
    .from('fel_settings')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  if (data) {
    const row = data as FelSettings;
    return {
      ...row,
      tope_consumidor_final: Number(row.tope_consumidor_final ?? 2500),
      horas_para_anular: Number(row.horas_para_anular ?? 24),
      api_clave: '',
      api_llave_firma: '',
      api_clave_cipher: null,
      api_llave_firma_cipher: null,
      tiene_clave: Boolean((data as { api_clave_cipher?: string; api_clave?: string }).api_clave_cipher ||
        (data as { api_clave?: string }).api_clave),
      tiene_llave_firma: Boolean((data as { api_llave_firma_cipher?: string }).api_llave_firma_cipher ||
        (data as { api_llave_firma?: string }).api_llave_firma),
    };
  }

  // Defaults en memoria (no se persiste hasta que el usuario guarda). El
  // régimen por defecto es el más común en un restaurante pequeño, pero la
  // pantalla obliga a confirmarlo antes de poder emitir.
  return {
    restaurant_id: restaurantId,
    provider: 'MANUAL',
    ambiente: 'PRUEBAS',
    nit_emisor: '',
    nombre_emisor: '',
    nombre_comercial: '',
    correo_emisor: null,
    direccion: '',
    codigo_postal: '01001',
    municipio: 'Guatemala',
    departamento: 'Guatemala',
    pais: 'GT',
    codigo_establecimiento: '1',
    regimen_iva: 'GENERAL',
    regimen_isr: 'SIMPLIFICADO',
    agente_retencion_iva: false,
    numero_resolucion: null,
    fecha_resolucion: null,
    moneda: 'GTQ',
    iva_incluido: true,
    emision_automatica: true,
    facturar_propina: false,
    tope_consumidor_final: 2500,
    horas_para_anular: 24,
    serie_prefijo: '',
    api_usuario: '',
    api_clave: '',
    api_llave_firma: '',
    api_clave_cipher: null,
    api_llave_firma_cipher: null,
    tiene_clave: false,
    tiene_llave_firma: false,
    next_correlativo: 1,
    updated_at: new Date().toISOString(),
  };
}

/** Estado de la configuración, para que la pantalla no adivine. */
export interface FelEstadoConfig {
  /** Lo que falta o está mal. Vacío = se puede emitir. */
  problemas: string[];
  /** Las leyendas legales que saldrán impresas, para que el dueño las confirme. */
  frases: string[];
  /** Si transmite de verdad al SAT o solo numera internamente. */
  esFiscal: boolean;
  /** Faltan credenciales del certificador. */
  faltanCredenciales: boolean;
}

export function getFelEstadoConfig(settings: FelSettings): FelEstadoConfig {
  const esFiscal = settings.provider !== 'MANUAL';
  return {
    problemas: problemasParaEmitir(settings),
    frases: textosDeFrases(configFiscalDe(settings) as ConfigFiscal),
    esFiscal,
    faltanCredenciales: esFiscal && !(settings.api_usuario && settings.tiene_clave && settings.tiene_llave_firma),
  };
}

export async function listFelDocuments(restaurantId: string, limit = 50): Promise<FelDocument[]> {
  const db = createServiceClient();
  const { data } = await db
    .from('fel_documents')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as FelDocument[];
}

/** Resumen de facturación del restaurante (para KPIs de la página). */
export interface FelSummary {
  total: number;
  certificados: number;
  pendientes: number;
  conError: number;
  montoCertificado: number;
  /** Documentos internos, que NO valen ante el SAT. Se cuentan aparte a propósito. */
  internos: number;
}

/**
 * Contadores del panel.
 *
 * Antes esto se calculaba cargando 500 documentos y filtrándolos en
 * memoria: correcto con pocas ventas y cada vez más caro. Los conteos los
 * hace Postgres, y solo se traen filas para sumar el monto.
 */
export async function getFelSummary(restaurantId: string): Promise<FelSummary> {
  const db = createServiceClient();
  const base = () => db.from('fel_documents').select('id', { count: 'exact', head: true }).eq('restaurant_id', restaurantId);

  const [total, certificados, pendientes, conError, internos, montos] = await Promise.all([
    base(),
    base().eq('estado', 'CERTIFICADO').eq('es_fiscal', true),
    base().eq('estado', 'PENDIENTE'),
    base().eq('estado', 'ERROR'),
    base().eq('es_fiscal', false).neq('estado', 'ANULADO'),
    db
      .from('fel_documents')
      .select('monto_total, tipo')
      .eq('restaurant_id', restaurantId)
      .eq('estado', 'CERTIFICADO')
      .eq('es_fiscal', true),
  ]);

  // Una nota de crédito resta: si no, el monto facturado del mes queda
  // inflado por documentos que precisamente revierten una venta.
  const montoCertificado = (montos.data ?? []).reduce((a, d) => {
    const v = Number((d as { monto_total: number }).monto_total);
    return (d as { tipo: string }).tipo === 'NCRE' ? a - v : a + v;
  }, 0);

  return {
    total: total.count ?? 0,
    certificados: certificados.count ?? 0,
    pendientes: pendientes.count ?? 0,
    conError: conError.count ?? 0,
    internos: internos.count ?? 0,
    montoCertificado,
  };
}

export interface InvoiceableOrder {
  id: string;
  order_number: string;
  customer_name: string;
  total: number;
  created_at: string;
  status: string;
  already_invoiced: boolean;
}

/**
 * Pedidos recientes que se pueden facturar (no cancelados), marcando los que
 * ya tienen un documento FEL para no duplicar.
 */
export async function getInvoiceableOrders(restaurantId: string, limit = 30): Promise<InvoiceableOrder[]> {
  const db = createServiceClient();
  const { data: orders } = await db
    .from('orders')
    .select('id, order_number, customer_name, total, created_at, status')
    .eq('restaurant_id', restaurantId)
    .neq('status', 'CANCEL')
    .order('created_at', { ascending: false })
    .limit(limit);

  const rows = (orders ?? []) as Array<{ id: string; order_number: string; customer_name: string; total: number; created_at: string; status: string }>;
  if (rows.length === 0) return [];

  // Solo facturas: una nota de crédito referencia el mismo pedido y no
  // significa que el pedido siga facturado.
  const { data: docs } = await db
    .from('fel_documents')
    .select('order_id')
    .eq('restaurant_id', restaurantId)
    .in('order_id', rows.map((r) => r.id))
    .in('tipo', ['FACT', 'FPEQ'])
    .neq('estado', 'ANULADO');

  const invoiced = new Set((docs ?? []).map((d) => d.order_id as string));

  return rows.map((r) => ({
    ...r,
    total: Number(r.total),
    already_invoiced: invoiced.has(r.id),
  }));
}

/** El documento fiscal de un pedido, para imprimirlo en el ticket. */
export async function getFelDocumentForOrder(orderId: string): Promise<FelDocument | null> {
  const db = createServiceClient();
  const { data } = await db
    .from('fel_documents')
    .select('*')
    .eq('order_id', orderId)
    .in('tipo', ['FACT', 'FPEQ'])
    .neq('estado', 'ANULADO')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as FelDocument) ?? null;
}

export const FEL_PROVIDERS: FelProvider[] = ['MANUAL', 'INFILE', 'G4S', 'DIGIFACT', 'OTRO'];
