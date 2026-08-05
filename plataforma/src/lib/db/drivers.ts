/* ============================================================
   CONSULTAS DE REPARTO (Fase 2)
   ------------------------------------------------------------
   Service role a propósito: la pantalla del repartidor tiene que ver el
   teléfono y la dirección del cliente para poder entregar, y el filtro que
   lo acota a SUS pedidos se aplica aquí (driver_id). Las políticas RLS de
   `orders` hoy razonan por restaurante, no por repartidor — endurecerlas
   por repartidor es trabajo de la fase de endurecimiento, no de esta.
   ============================================================ */

import { createServiceClient } from '@/lib/supabase/service';

export interface Driver {
  id: string;
  nombre: string;
  telefono: string | null;
  vehiculo: string | null;
  profile_id: string | null;
  activo: boolean;
}

export interface DriverOrder {
  id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  address: string | null;
  delivery_zone: string | null;
  delivery_lat: number | null;
  delivery_lng: number | null;
  status: string;
  total: number;
  payment_method: string;
  cash_amount: number | null;
  cash_collected: number | null;
  notes: string | null;
  created_at: string;
}

export async function getDrivers(restaurantId: string): Promise<Driver[]> {
  const db = createServiceClient();
  const { data } = await db
    .from('drivers')
    .select('id, nombre, telefono, vehiculo, profile_id, activo')
    .eq('restaurant_id', restaurantId)
    .order('activo', { ascending: false })
    .order('nombre');
  return (data ?? []) as Driver[];
}

// Un solo literal, sin concatenar con `+`: el cliente de Supabase infiere el
// tipo de la fila a partir del TEXTO del select, y concatenar lo ensancha a
// `string`, con lo que devuelve GenericStringError en vez de la fila.
const DRIVER_ORDER_COLUMNS =
  'id, order_number, customer_name, customer_phone, address, delivery_zone, delivery_lat, delivery_lng, status, total, payment_method, cash_amount, cash_collected, notes, created_at';

/** Repartidor enlazado a un perfil (null si ese perfil no reparte). */
export async function getDriverByProfile(profileId: string): Promise<
  { id: string; restaurantId: string; nombre: string; activo: boolean } | null
> {
  const db = createServiceClient();
  const { data } = await db
    .from('drivers')
    .select('id, restaurant_id, nombre, activo')
    .eq('profile_id', profileId)
    .single();

  if (!data) return null;
  return {
    id: data.id as string,
    restaurantId: data.restaurant_id as string,
    nombre: data.nombre as string,
    activo: data.activo as boolean,
  };
}

/** Pedidos que el repartidor tiene en la mano: listos para salir o en camino. */
export async function getActiveDriverOrders(driverId: string): Promise<DriverOrder[]> {
  const db = createServiceClient();
  const { data } = await db
    .from('orders')
    .select(DRIVER_ORDER_COLUMNS)
    .eq('driver_id', driverId)
    .in('status', ['READY', 'TRANSIT'])
    // El que lleva más esperando primero: se enfría.
    .order('created_at', { ascending: true });
  return (data ?? []) as DriverOrder[];
}

export interface ShiftSummary {
  entregados: number;
  totalVendido: number;
  efectivoRecibido: number;
  /** Pedidos entregados sin registrar efectivo (tarjeta al recibir, o se
   *  olvidó anotarlo). Se muestra aparte para que el cuadre no mienta. */
  sinRegistro: number;
}

/**
 * Resumen del turno para cuadrar caja. "Hoy" = desde la medianoche local del
 * servidor; es una aproximación deliberada — el cierre de turno real puede
 * cruzar la medianoche y eso se afina cuando exista el concepto de turno.
 */
export async function getDriverShiftSummary(driverId: string): Promise<ShiftSummary> {
  const db = createServiceClient();
  const since = new Date();
  since.setHours(0, 0, 0, 0);

  const { data } = await db
    .from('orders')
    .select('total, cash_collected, payment_method')
    .eq('driver_id', driverId)
    .eq('status', 'DELIVERED')
    .gte('delivered_at', since.toISOString());

  const rows = (data ?? []) as { total: number; cash_collected: number | null; payment_method: string }[];

  return rows.reduce<ShiftSummary>(
    (acc, r) => ({
      entregados: acc.entregados + 1,
      totalVendido: acc.totalVendido + Number(r.total ?? 0),
      efectivoRecibido: acc.efectivoRecibido + Number(r.cash_collected ?? 0),
      sinRegistro: acc.sinRegistro + (r.cash_collected == null ? 1 : 0),
    }),
    { entregados: 0, totalVendido: 0, efectivoRecibido: 0, sinRegistro: 0 },
  );
}
