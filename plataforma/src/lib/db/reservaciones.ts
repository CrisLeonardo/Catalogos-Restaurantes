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

export type ReservaEnSalon = { nombre: string; fecha: string; hora: string; personas: number };

export async function getProximasReservasDeMesa(restaurantId: string, timeZone: string):
  Promise<Record<number, ReservaEnSalon>> {
  const opciones: Intl.DateTimeFormatOptions = {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  };
  let formato: Intl.DateTimeFormat;
  try {
    formato = new Intl.DateTimeFormat('sv-SE', { ...opciones, timeZone });
  } catch {
    formato = new Intl.DateTimeFormat('sv-SE', { ...opciones, timeZone: 'America/Guatemala' });
  }
  const partes = formato.formatToParts(new Date());
  const valor = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((p) => p.type === tipo)?.value;
  const hoy = `${valor('year')}-${valor('month')}-${valor('day')}`;
  const hora = `${valor('hour')}:${valor('minute')}`;
  const { data } = await createServiceClient().from('reservations')
    .select('table_number,customer_name,date,time,party_size')
    .eq('restaurant_id', restaurantId).eq('status', 'CONFIRMED').not('table_number', 'is', null)
    .or(`date.gt.${hoy},and(date.eq.${hoy},time.gte.${hora})`)
    .order('date').order('time').limit(100);
  const resultado: Record<number, ReservaEnSalon> = {};
  for (const r of data ?? []) {
    resultado[r.table_number] ??= { nombre: r.customer_name, fecha: r.date, hora: r.time.slice(0, 5), personas: r.party_size };
  }
  return resultado;
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
