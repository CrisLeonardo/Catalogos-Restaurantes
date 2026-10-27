/* ============================================================
   MOMENTOS PICO — las consultas
   ------------------------------------------------------------
   Lo que Hoy, la caja y el aviso del primer pedido necesitan saber
   para celebrar solo lo que es verdad. Las reglas (cuándo algo es
   récord o hito) viven en lib/momentos.ts, sin base de datos.
   ============================================================ */

import { createServiceClient } from '@/lib/supabase/service';
import { corteDelRestaurante } from '@/lib/db/dia-negocio';
import { bordesDelDia, diaDeNegocio, sumarDias } from '@/lib/caja/dia';
import { getSalesReport } from '@/lib/db/reports';
import {
  hitoAlcanzado, horaPico, recordDelDia,
  type Hito, type HoraPico, type RecordDelDia,
} from '@/lib/momentos';

const UUID_RE = /^[0-9a-f-]{36}$/i;
/** PostgREST corta en 1,000 filas: un día no llega ni cerca. */
const PAGINA = 1000;

function horaLocal(d: Date, timezone: string): number {
  try {
    return Number(d.toLocaleString('en-GB', { timeZone: timezone, hour: '2-digit', hour12: false })) % 24;
  } catch {
    return d.getHours();
  }
}

function nombreDelDia(dateKey: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('es-GT', { weekday: 'long', timeZone: timezone })
      .format(new Date(`${dateKey}T18:00:00Z`))
      .toLowerCase();
  } catch {
    return 'día';
  }
}

export interface TuDia {
  /** Clave YYYY-MM-DD del día de negocio de hoy. */
  hoy: string;
  /** Lo vendido hoy (sin cancelados). */
  ventasHoy: number;
  pedidosHoy: number;
  record: RecordDelDia | null;
  horaPico: HoraPico | null;
}

/**
 * ¿Hoy ya es récord y cuál fue la hora pico? Las ventas por día salen del
 * reporte agregado en SQL (leogin_sales_report, el mismo de Métricas), así
 * que cuentan igual que Hoy y la caja: el día corta a la hora de corte del
 * restaurante y los cancelados no suman. Para la hora pico basta con los
 * pedidos de hoy.
 */
export async function getTuDia(restaurantId: string, timezone: string, dia?: string): Promise<TuDia | null> {
  if (!UUID_RE.test(restaurantId)) return null;
  const db = createServiceClient();
  const corte = await corteDelRestaurante(restaurantId);
  // `dia`: el día de negocio de un turno que se acaba de cerrar (la caja);
  // sin él, hoy.
  const hoy = dia && /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : diaDeNegocio(new Date(), timezone, corte);
  const { desde, hasta } = bordesDelDia(hoy, timezone, corte);

  const [reporte, { data: deHoy }] = await Promise.all([
    getSalesReport(restaurantId, sumarDias(hoy, -30), hoy, timezone, corte),
    db
      .from('orders')
      .select('created_at')
      .eq('restaurant_id', restaurantId)
      .neq('status', 'CANCEL')
      .gte('created_at', desde.toISOString())
      .lt('created_at', hasta.toISOString())
      .limit(PAGINA),
  ]);

  const ventas = new Map<string, number>(reporte.series.map((d) => [d.date, d.revenue]));
  const horasHoy = ((deHoy ?? []) as Array<{ created_at: string }>).map((o) => horaLocal(new Date(o.created_at), timezone));

  return {
    hoy,
    ventasHoy: ventas.get(hoy) ?? 0,
    pedidosHoy: horasHoy.length,
    record: recordDelDia(ventas, hoy, nombreDelDia(hoy, timezone)),
    horaPico: horaPico(horasHoy),
  };
}

export interface HitosDelRestaurante {
  pedidos: number;
  diasDesdeAlta: number;
  hito: Hito | null;
}

export async function getHitos(restaurantId: string): Promise<HitosDelRestaurante | null> {
  if (!UUID_RE.test(restaurantId)) return null;
  const db = createServiceClient();
  const [{ count }, { data: rest }] = await Promise.all([
    db.from('orders').select('id', { count: 'exact', head: true }).eq('restaurant_id', restaurantId).neq('status', 'CANCEL'),
    db.from('restaurants').select('created_at').eq('id', restaurantId).maybeSingle(),
  ]);
  const pedidos = count ?? 0;
  const alta = (rest as { created_at?: string } | null)?.created_at;
  const diasDesdeAlta = alta ? Math.floor((Date.now() - new Date(alta).getTime()) / 86_400_000) : 0;
  return { pedidos, diasDesdeAlta, hito: hitoAlcanzado(pedidos, diasDesdeAlta) };
}

export interface PrimerPedido {
  id: string;
  numero: string | null;
  cliente: string | null;
  total: number;
  creado: string;
}

/** Hasta cuántos pedidos se sigue celebrando el primero (si el dueño no
 *  estaba mirando cuando entró, lo ve al volver). */
const PRIMEROS = 3;
/** Y hasta cuántos días después. */
const DIAS_PRIMER_PEDIDO = 14;

/**
 * El primer pedido del restaurante, si todavía es noticia: hay entre 1 y 3
 * pedidos en total y el primero entró hace menos de dos semanas. Si no,
 * null — y el panel deja de preguntar.
 */
export async function getPrimerPedido(restaurantId: string): Promise<PrimerPedido | null> {
  if (!UUID_RE.test(restaurantId)) return null;
  const db = createServiceClient();
  const { data, count } = await db
    .from('orders')
    .select('id, order_number, customer_name, total, created_at', { count: 'exact' })
    .eq('restaurant_id', restaurantId)
    .neq('status', 'CANCEL')
    .order('created_at', { ascending: true })
    .limit(1);
  if (!count || count > PRIMEROS || !data?.[0]) return null;
  const o = data[0] as { id: string; order_number: string | null; customer_name: string | null; total: number | string; created_at: string };
  if (Date.now() - new Date(o.created_at).getTime() > DIAS_PRIMER_PEDIDO * 86_400_000) return null;
  return { id: o.id, numero: o.order_number, cliente: o.customer_name, total: Number(o.total), creado: o.created_at };
}
