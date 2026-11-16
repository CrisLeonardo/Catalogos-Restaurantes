import 'server-only';

import { createServiceClient } from '@/lib/supabase/service';
import { mesaDeFila, direccionDeMesa } from '@/lib/mesa';
import type { PedidoVivo } from '@/lib/hoy-etapa';

/* Lecturas de Hoy por etapa (fichas 2.1 y 2.2). Las reglas, en lib/hoy-etapa.ts.
   Todo con el cliente de servicio: la página ya comprobó quién mira y qué
   puede ver antes de pedir cada cosa. */

type Fila = {
  id: string; status: PedidoVivo['status']; order_type: PedidoVivo['order_type'];
  created_at: string; accepted_at: string | null; ready_at: string | null; total: number | string;
  address: string | null; table_number?: number | null; customer_name: string | null; es_prueba?: boolean;
};

function etiquetaDe(f: Fila): string {
  if (f.order_type === 'DINE_IN') {
    const n = mesaDeFila(f);
    return n != null ? direccionDeMesa(n) : 'En el local';
  }
  return f.order_type === 'PICKUP' ? 'Para llevar' : 'Domicilio';
}

/** Los pedidos vivos de las últimas 48 h, o null si la lectura falló. */
export async function getPedidosVivos(restaurantId: string): Promise<PedidoVivo[] | null> {
  const { data, error } = await createServiceClient()
    .from('orders')
    .select('id, status, order_type, created_at, accepted_at, ready_at, total, address, table_number, customer_name, es_prueba')
    .eq('restaurant_id', restaurantId)
    .not('status', 'in', '("DELIVERED","CANCEL")')
    .gte('created_at', new Date(Date.now() - 48 * 3600_000).toISOString())
    .order('created_at', { ascending: true })
    .limit(300);
  if (error) return null;
  return ((data ?? []) as unknown as Fila[]).map((f) => {
    const etiqueta = etiquetaDe(f);
    const nombre = f.customer_name?.trim() || null;
    return {
      id: f.id, status: f.status, order_type: f.order_type, created_at: f.created_at,
      accepted_at: f.accepted_at, ready_at: f.ready_at, total: Number(f.total) || 0,
      etiqueta,
      /* «Mesa 7 · Mesa 7»: en un pedido de mesa sin nombre, el nombre del
         cliente se llena con el de la mesa. Se dice una sola vez. */
      cliente: nombre && nombre !== etiqueta && nombre !== f.address ? nombre : null,
      es_prueba: f.es_prueba === true,
    };
  });
}

/** Lo que marca los pasos 1 y 3 de la guía. */
export async function getAvanceGuia(restaurantId: string): Promise<{ platillos: number; pedidoRecorrido: boolean }> {
  const db = createServiceClient();
  const [prod, prueba, real] = await Promise.all([
    db.from('products').select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId).eq('is_active', true),
    // El de prueba cuenta al llegar a «listo»: ya pasó por cocina.
    db.from('orders').select('id').eq('restaurant_id', restaurantId)
      .eq('es_prueba', true).not('ready_at', 'is', null).limit(1),
    // Un pedido real ya entregado también cumple el paso.
    db.from('orders').select('id').eq('restaurant_id', restaurantId)
      .eq('es_prueba', false).in('status', ['DELIVERED', 'SERVED']).limit(1),
  ]);
  return {
    platillos: prod.count ?? 0,
    pedidoRecorrido: (prueba.data?.length ?? 0) > 0 || (real.data?.length ?? 0) > 0,
  };
}

export interface CierresDelDia {
  /** Lo cobrado en los turnos ya cerrados del día de negocio. */
  cobrado: number;
  /** Suma de diferencias (contado − esperado) de esos cierres. */
  diferencia: number;
  cierres: number;
  ultimo: { at: string; cajero: string | null } | null;
}

/** Los cierres de caja del día de negocio, o null si la lectura falló. */
export async function getCierresDelDia(restaurantId: string, dia: string): Promise<CierresDelDia | null> {
  const { data, error } = await createServiceClient()
    .from('cash_counts')
    .select('by_method, difference, cashier_name, closed_at, created_at')
    .eq('restaurant_id', restaurantId)
    .eq('business_date', dia)
    .eq('status', 'CLOSED')
    .order('created_at', { ascending: true });
  if (error) return null;
  const filas = (data ?? []) as {
    by_method: Record<string, number> | null; difference: number | string | null;
    cashier_name: string | null; closed_at: string | null; created_at: string;
  }[];
  const cent = (n: number) => Math.round(n * 100) / 100;
  let cobrado = 0;
  let diferencia = 0;
  for (const f of filas) {
    for (const v of Object.values(f.by_method ?? {})) cobrado = cent(cobrado + (Number(v) || 0));
    diferencia = cent(diferencia + (Number(f.difference) || 0));
  }
  const u = filas.at(-1);
  return {
    cobrado, diferencia, cierres: filas.length,
    ultimo: u ? { at: u.closed_at ?? u.created_at, cajero: u.cashier_name } : null,
  };
}

/** Lo comprobable de la semana: pedidos atendidos, cierres y tiempo en cocina. */
export async function getSemana(restaurantId: string): Promise<{
  pedidos: number; cierres: number; cocinaMin: number | null;
} | null> {
  const desde = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
  const db = createServiceClient();
  const [ped, cie, tiempos] = await Promise.all([
    db.from('orders').select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId).eq('es_prueba', false)
      .in('status', ['DELIVERED', 'SERVED']).gte('created_at', desde),
    db.from('cash_counts').select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId).eq('status', 'CLOSED').gte('created_at', desde),
    db.from('orders').select('accepted_at, ready_at')
      .eq('restaurant_id', restaurantId).eq('es_prueba', false)
      .not('accepted_at', 'is', null).not('ready_at', 'is', null)
      .gte('created_at', desde).limit(2000),
  ]);
  if (ped.error || cie.error) return null;
  /* Tiempo medio de cocina: de aceptado a listo. Se descartan los que
     pasaron de 3 h (un pedido olvidado no es un tiempo de cocina) y con
     menos de cinco medidos no se dice nada. */
  const medidos = ((tiempos.data ?? []) as { accepted_at: string; ready_at: string }[])
    .map((t) => new Date(t.ready_at).getTime() - new Date(t.accepted_at).getTime())
    .filter((ms) => ms > 0 && ms < 3 * 3600_000);
  const cocinaMin = medidos.length >= 5
    ? Math.round(medidos.reduce((s, ms) => s + ms, 0) / medidos.length / 60_000)
    : null;
  return { pedidos: ped.count ?? 0, cierres: cie.count ?? 0, cocinaMin };
}
