import { createServiceClient } from '@/lib/supabase/service';
import type { FelSettings, FelDocument, FelProvider } from '@/lib/fel';

/** Config FEL del restaurante, con defaults si aún no existe fila. */
export async function getFelSettings(restaurantId: string): Promise<FelSettings> {
  const db = createServiceClient();
  const { data } = await db
    .from('fel_settings')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  if (data) return data as FelSettings;

  // Defaults en memoria (no se persiste hasta que el usuario guarda).
  return {
    restaurant_id: restaurantId,
    provider: 'MANUAL',
    ambiente: 'PRUEBAS',
    nit_emisor: '',
    nombre_emisor: '',
    nombre_comercial: '',
    direccion: '',
    codigo_establecimiento: '1',
    afiliacion_iva: 'GEN',
    moneda: 'GTQ',
    iva_incluido: true,
    serie_prefijo: '',
    api_usuario: '',
    api_clave: '',
    api_llave_firma: '',
    next_correlativo: 1,
    updated_at: new Date().toISOString(),
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
  montoCertificado: number;
}

export async function getFelSummary(restaurantId: string): Promise<FelSummary> {
  const docs = await listFelDocuments(restaurantId, 500);
  const certificados = docs.filter((d) => d.estado === 'CERTIFICADO');
  return {
    total: docs.length,
    certificados: certificados.length,
    pendientes: docs.filter((d) => d.estado === 'PENDIENTE').length,
    montoCertificado: certificados.reduce((a, d) => a + Number(d.monto_total), 0),
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

  const { data: docs } = await db
    .from('fel_documents')
    .select('order_id')
    .eq('restaurant_id', restaurantId)
    .in('order_id', rows.map((r) => r.id))
    .neq('estado', 'ANULADO');

  const invoiced = new Set((docs ?? []).map((d) => d.order_id as string));

  return rows.map((r) => ({
    ...r,
    total: Number(r.total),
    already_invoiced: invoiced.has(r.id),
  }));
}

export const FEL_PROVIDERS: FelProvider[] = ['MANUAL', 'INFILE', 'G4S', 'DIGIFACT', 'OTRO'];
