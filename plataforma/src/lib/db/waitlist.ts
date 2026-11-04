import { createServiceClient } from '@/lib/supabase/service';
import { lecturaDe, type Lectura } from '@/lib/db/lectura';

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
  /** Mesa donde se sentaron (migración 128). `null` mientras no llegan, y
      también en una base donde la 128 todavía no corrió. */
  table_number?: number | null;
}

export interface WaitlistSummary {
  waiting: number;
  notified: number;
  /** Espera promedio (minutos) de quienes ya se sentaron hoy — referencia para el host. */
  avgWaitMinutesToday: number | null;
}

/** Grupos en cola ahora mismo (esperando o ya avisados), del más antiguo al más nuevo. */
/* Un error ya no se pinta «No hay nadie esperando» (auditoría 2026-11-03, X20):
   el host podría dejar de atender a quien sí está en la cola. */
export async function getActiveWaitlist(restaurantId: string): Promise<Lectura<WaitlistEntry[]>> {
  const db = createServiceClient();
  const { data, error } = await db
    .from('waitlist_entries')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .in('status', ['WAITING', 'NOTIFIED'])
    .order('created_at', { ascending: true })
    .limit(200);
  return lecturaDe(error, data as WaitlistEntry[] | null, [], {
    contexto: 'getActiveWaitlist', parcial: (data?.length ?? 0) >= 200,
  });
}

/** Historial reciente (sentados/cancelados) — para referencia del día. */
export async function getRecentWaitlist(restaurantId: string, limit = 30): Promise<Lectura<WaitlistEntry[]>> {
  const db = createServiceClient();
  const { data, error } = await db
    .from('waitlist_entries')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .in('status', ['SEATED', 'CANCELLED'])
    .order('created_at', { ascending: false })
    .limit(limit);
  return lecturaDe(error, data as WaitlistEntry[] | null, [], { contexto: 'getRecentWaitlist' });
}

export async function getWaitlistSummary(restaurantId: string): Promise<Lectura<WaitlistSummary>> {
  const db = createServiceClient();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [{ data: active, error: e1 }, { data: seatedToday, error: e2 }] = await Promise.all([
    db.from('waitlist_entries').select('status').eq('restaurant_id', restaurantId).in('status', ['WAITING', 'NOTIFIED']),
    db.from('waitlist_entries').select('created_at, seated_at').eq('restaurant_id', restaurantId).eq('status', 'SEATED').gte('created_at', todayStart.toISOString()),
  ]);
  if (e1 || e2) {
    return lecturaDe(e1 ?? e2, null, { waiting: 0, notified: 0, avgWaitMinutesToday: null }, { contexto: 'getWaitlistSummary' });
  }

  const waiting = (active ?? []).filter((r) => r.status === 'WAITING').length;
  const notified = (active ?? []).filter((r) => r.status === 'NOTIFIED').length;

  const waits = (seatedToday ?? [])
    .filter((r) => r.seated_at)
    .map((r) => (new Date(r.seated_at as string).getTime() - new Date(r.created_at).getTime()) / 60000);
  const avgWaitMinutesToday = waits.length > 0 ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : null;

  return lecturaDe(null, { waiting, notified, avgWaitMinutesToday }, { waiting: 0, notified: 0, avgWaitMinutesToday: null });
}
