import { createServiceClient } from '@/lib/supabase/service';

export type ReservationStatus = 'PENDING' | 'CONFIRMED' | 'SEATED' | 'COMPLETED' | 'CANCELLED';

export interface Reservation {
  id: string;
  restaurant_id: string;
  customer_name: string;
  customer_phone: string | null;
  party_size: number;
  date: string;
  time: string;
  notes: string | null;
  status: ReservationStatus;
  created_at: string;
  /** Mesa donde se sentaron (migración 128). `null` mientras no llegan, y
      también en una base donde la 128 todavía no corrió. */
  table_number?: number | null;
}

export interface ReservationSummary {
  pending: number;
  confirmed: number;
  today: number;
}

export async function getReservations(restaurantId: string, dateFrom?: string, dateTo?: string): Promise<Reservation[]> {
  const db = createServiceClient();
  let q = db
    .from('reservations')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .not('status', 'in', '("COMPLETED","CANCELLED")')
    .order('date', { ascending: true })
    .order('time', { ascending: true })
    .limit(200);

  if (dateFrom) q = q.gte('date', dateFrom);
  if (dateTo) q = q.lte('date', dateTo);

  const { data } = await q;
  return (data ?? []) as Reservation[];
}

export async function getRecentReservations(restaurantId: string, limit = 50): Promise<Reservation[]> {
  const db = createServiceClient();
  const { data } = await db
    .from('reservations')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('date', { ascending: false })
    .order('time', { ascending: false })
    .limit(limit);
  return (data ?? []) as Reservation[];
}

export async function getReservationSummary(restaurantId: string): Promise<ReservationSummary> {
  const db = createServiceClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data } = await db
    .from('reservations')
    .select('status, date')
    .eq('restaurant_id', restaurantId)
    .gte('date', today)
    .not('status', 'in', '("COMPLETED","CANCELLED")');

  const rows = data ?? [];
  return {
    pending: rows.filter((r) => r.status === 'PENDING').length,
    confirmed: rows.filter((r) => r.status === 'CONFIRMED').length,
    today: rows.filter((r) => r.date === today).length,
  };
}
