import { createServiceClient } from '@/lib/supabase/service';

export type WaitlistStatus = 'WAITING' | 'NOTIFIED' | 'SEATED' | 'CANCELLED';

export interface WaitlistEntry {
  id: string;
  restaurant_id: string;
  customer_name: string;
  party_size: number;
  phone: string | null;
  notes: string | null;
  status: WaitlistStatus;
  created_at: string;
  notified_at: string | null;
  seated_at: string | null;
  cancelled_at: string | null;
}

export interface WaitlistSummary {
  waiting: number;
  notified: number;
  /** Espera promedio (minutos) de quienes ya se sentaron hoy — referencia para el host. */
  avgWaitMinutesToday: number | null;
}

/** Grupos en cola ahora mismo (esperando o ya avisados), del más antiguo al más nuevo. */
export async function getActiveWaitlist(restaurantId: string): Promise<WaitlistEntry[]> {
  const db = createServiceClient();
  const { data } = await db
    .from('waitlist_entries')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .in('status', ['WAITING', 'NOTIFIED'])
    .order('created_at', { ascending: true })
    .limit(200);
  return (data ?? []) as WaitlistEntry[];
}

/** Historial reciente (sentados/cancelados) — para referencia del día. */
export async function getRecentWaitlist(restaurantId: string, limit = 30): Promise<WaitlistEntry[]> {
  const db = createServiceClient();
  const { data } = await db
    .from('waitlist_entries')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .in('status', ['SEATED', 'CANCELLED'])
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as WaitlistEntry[];
}

export async function getWaitlistSummary(restaurantId: string): Promise<WaitlistSummary> {
  const db = createServiceClient();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [{ data: active }, { data: seatedToday }] = await Promise.all([
    db.from('waitlist_entries').select('status').eq('restaurant_id', restaurantId).in('status', ['WAITING', 'NOTIFIED']),
    db.from('waitlist_entries').select('created_at, seated_at').eq('restaurant_id', restaurantId).eq('status', 'SEATED').gte('created_at', todayStart.toISOString()),
  ]);

  const waiting = (active ?? []).filter((r) => r.status === 'WAITING').length;
  const notified = (active ?? []).filter((r) => r.status === 'NOTIFIED').length;

  const waits = (seatedToday ?? [])
    .filter((r) => r.seated_at)
    .map((r) => (new Date(r.seated_at as string).getTime() - new Date(r.created_at).getTime()) / 60000);
  const avgWaitMinutesToday = waits.length > 0 ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : null;

  return { waiting, notified, avgWaitMinutesToday };
}
