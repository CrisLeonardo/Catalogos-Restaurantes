import { createServiceClient } from '@/lib/supabase/service';

export type WaitlistStatus = 'WAITING' | 'NOTIFIED' | 'SEATED' | 'CANCELLED' | 'NO_SHOW';

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
  cancelled_at?: string | null;
  /** Se abrió WhatsApp para avisar (178): NO prueba que se enviara. */
  aviso_abierto_at?: string | null;
  /** Cómo confirmó el host que avisó (178). */
  notified_via?: 'whatsapp' | 'en_persona' | null;
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

/* ── Recepción por día de negocio (auditoría 1.8, X13 y R18.5) ─────────
   La cola de hoy, lo que quedó pendiente de días anteriores («Por revisar»)
   y el historial de HOY de verdad —antes «Hoy más temprano» mostraba
   cualquier fecha—. Un error de lectura se lanza: no se pinta vacío. */

export type EsperaDeRecepcion = {
  cola: WaitlistEntry[];
  porRevisar: WaitlistEntry[];
  historial: WaitlistEntry[];
  /** Minutos que esperaron los grupos sentados hoy, para el rango estimado. */
  esperasDeHoy: number[];
};

export async function getEsperaDeRecepcion(restaurantId: string, desde: Date): Promise<EsperaDeRecepcion> {
  const db = createServiceClient();
  const iso = desde.toISOString();
  const base = () => db.from('waitlist_entries').select('*').eq('restaurant_id', restaurantId);
  const [cola, revisar, historial] = await Promise.all([
    base().in('status', ['WAITING', 'NOTIFIED']).gte('created_at', iso).order('created_at', { ascending: true }).limit(200),
    base().in('status', ['WAITING', 'NOTIFIED']).lt('created_at', iso).order('created_at', { ascending: false }).limit(50),
    base().in('status', ['SEATED', 'CANCELLED', 'NO_SHOW']).gte('created_at', iso).order('created_at', { ascending: false }).limit(100),
  ]);
  const error = cola.error ?? revisar.error ?? historial.error;
  if (error) throw new Error('No se pudo leer la lista de espera. Actualiza la página.');
  const hechos = (historial.data ?? []) as WaitlistEntry[];
  return {
    cola: (cola.data ?? []) as WaitlistEntry[],
    porRevisar: (revisar.data ?? []) as WaitlistEntry[],
    historial: hechos,
    esperasDeHoy: hechos
      .filter((w) => w.status === 'SEATED' && w.seated_at)
      .map((w) => (new Date(w.seated_at as string).getTime() - new Date(w.created_at).getTime()) / 60000),
  };
}
