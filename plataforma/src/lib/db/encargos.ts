import 'server-only';

import { createServiceClient } from '@/lib/supabase/service';
import type { EncargoFecha } from '@/lib/encargos';

/* ============================================================
   ENCARGOS — lectura (migración 149)
   ------------------------------------------------------------
   Service role; quien llama ya validó la sesión (panel) o es
   público a propósito (el menú enseña las tandas abiertas). Si la
   migración no ha corrido, todo devuelve listas vacías y el menú
   sigue igual que antes.
   ============================================================ */

type Fila = {
  id: string; titulo: string; entrega_fecha: string; entrega_hora: string | null;
  cierre_at: string; cupo: number; pago_adelantado: boolean; activo: boolean;
};

/** Pedidos no anulados por tanda. */
export async function ocupadosPorEncargo(ids: string[]): Promise<Map<string, number>> {
  const cuenta = new Map<string, number>();
  if (ids.length === 0) return cuenta;
  const db = createServiceClient();
  const { data } = await db
    .from('orders')
    .select('encargo_id')
    .in('encargo_id', ids)
    .neq('status', 'CANCEL');
  for (const r of data ?? []) {
    const id = r.encargo_id as string;
    cuenta.set(id, (cuenta.get(id) ?? 0) + 1);
  }
  return cuenta;
}

async function conOcupados(filas: Fila[]): Promise<EncargoFecha[]> {
  const ocupados = await ocupadosPorEncargo(filas.map((f) => f.id));
  return filas.map((f) => ({
    id: f.id,
    titulo: f.titulo,
    entregaFecha: f.entrega_fecha,
    entregaHora: f.entrega_hora,
    cierreAt: f.cierre_at,
    cupo: Number(f.cupo),
    pagoAdelantado: f.pago_adelantado,
    activo: f.activo,
    ocupados: ocupados.get(f.id) ?? 0,
  }));
}

const COLUMNAS = 'id, titulo, entrega_fecha, entrega_hora, cierre_at, cupo, pago_adelantado, activo';

/** Lo que el menú enseña: activas y sin cerrar (llenas incluidas, para decir «agotado»). */
export async function encargosVisibles(restaurantId: string): Promise<EncargoFecha[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from('encargo_fechas')
    .select(COLUMNAS)
    .eq('restaurant_id', restaurantId)
    .eq('activo', true)
    .gt('cierre_at', new Date().toISOString())
    .order('entrega_fecha', { ascending: true })
    .limit(6);
  if (error || !data) return [];
  return conOcupados(data as Fila[]);
}

/** Una tanda concreta, para validar un pedido. null si no es de ese restaurante. */
export async function encargoParaPedido(restaurantId: string, encargoId: string): Promise<EncargoFecha | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from('encargo_fechas')
    .select(COLUMNAS)
    .eq('id', encargoId)
    .eq('restaurant_id', restaurantId)
    .maybeSingle();
  if (error || !data) return null;
  const [f] = await conOcupados([data as Fila]);
  return f;
}

export interface EncargoDelPanel extends EncargoFecha {
  pedidos: {
    id: string; orderNumber: string; customerName: string; customerPhone: string | null;
    orderType: string; total: number; status: string; transferStatus: string | null; createdAt: string;
  }[];
}

/** Panel: las tandas de los últimos 30 días y las que vienen, con sus pedidos. */
export async function encargosDelPanel(restaurantId: string): Promise<{ disponible: boolean; items: EncargoDelPanel[] }> {
  const db = createServiceClient();
  const desde = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await db
    .from('encargo_fechas')
    .select(COLUMNAS)
    .eq('restaurant_id', restaurantId)
    .gte('entrega_fecha', desde)
    .order('entrega_fecha', { ascending: true })
    .limit(40);
  if (error) return { disponible: false, items: [] };

  const fechas = await conOcupados((data ?? []) as Fila[]);
  if (fechas.length === 0) return { disponible: true, items: [] };

  const { data: pedidos } = await db
    .from('orders')
    .select('id, order_number, customer_name, customer_phone, order_type, total, status, transfer_status, created_at, encargo_id')
    .in('encargo_id', fechas.map((f) => f.id))
    .order('created_at', { ascending: true })
    .limit(2000);

  return {
    disponible: true,
    items: fechas.map((f) => ({
      ...f,
      pedidos: (pedidos ?? [])
        .filter((p) => p.encargo_id === f.id)
        .map((p) => ({
          id: p.id as string,
          orderNumber: p.order_number as string,
          customerName: p.customer_name as string,
          customerPhone: (p.customer_phone as string | null) ?? null,
          orderType: p.order_type as string,
          total: Number(p.total),
          status: p.status as string,
          transferStatus: (p.transfer_status as string | null) ?? null,
          createdAt: p.created_at as string,
        })),
    })),
  };
}

