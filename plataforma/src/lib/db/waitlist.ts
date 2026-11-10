import { createServiceClient } from '@/lib/supabase/service';
import { lecturaDe, type Lectura } from '@/lib/db/lectura';

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
