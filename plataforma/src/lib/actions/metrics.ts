'use server';

/* ============================================================
   MÉTRICAS — tracking de visitas y consultas de los paneles
   ------------------------------------------------------------
   · trackVisit: el cliente (anónimo) registra una vista de
     página; pasa por el service role para que la tabla quede
     cerrada por RLS (nadie la toca directo).
   · getVisitStats: agregados para el panel del dueño.
   · Lecturas siempre validan el rol del usuario autenticado.
   ============================================================ */

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { localDateKey } from '@/lib/hours';

const UUID_RE = /^[0-9a-f-]{36}$/i;
const PATH_RE = /^\/[\w\-/[\]%.]*$/;

export async function trackVisit(
  restaurantId: string,
  visitorId: string,
  path: string,
): Promise<void> {
  if (!UUID_RE.test(restaurantId) || !UUID_RE.test(visitorId)) return;
  const safePath = PATH_RE.test(path) ? path.slice(0, 120) : '/';

  try {
    const db = createServiceClient();
    await db.from('page_visits').insert({
      restaurant_id: restaurantId,
      visitor_id: visitorId,
      path: safePath,
    });
  } catch {
    // Las métricas jamás deben romper la página del cliente.
  }
}

/* ── Lecturas (panel del dueño) ───────────────────────────── */

export interface DayVisits {
  label: string;
  visits: number;
  isToday: boolean;
}

export interface VisitStats {
  today: number;
  uniqueToday: number;
  last7: number;
  unique7: number;
  last30: number;
  unique30: number;
  series14: DayVisits[];
}

const EMPTY_VISIT_STATS: VisitStats = {
  today: 0, uniqueToday: 0, last7: 0, unique7: 0, last30: 0, unique30: 0, series14: [],
};

/**
 * Agregados de visitas del restaurante. Se llama desde páginas del panel
 * (la página ya validó la sesión); aquí re-validamos que el usuario pueda
 * ver ESTE restaurante antes de tocar datos.
 */
export async function getVisitStats(
  restaurantId: string,
  timezone: string = 'America/Guatemala',
): Promise<VisitStats> {
  if (!UUID_RE.test(restaurantId)) return EMPTY_VISIT_STATS;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return EMPTY_VISIT_STATS;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, restaurant_id')
    .eq('id', user.id)
    .single();

  const allowed =
    profile?.role === 'SUPER_ADMIN' ||
    (['RESTAURANT_OWNER', 'RESTAURANT_STAFF'].includes(profile?.role ?? '') &&
      profile?.restaurant_id === restaurantId);
  if (!allowed) return EMPTY_VISIT_STATS;

  const db = createServiceClient();
  const since = new Date();
  since.setDate(since.getDate() - 31);

  const { data } = await db
    .from('page_visits')
    .select('visitor_id, created_at')
    .eq('restaurant_id', restaurantId)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })
    .limit(50000);

  const rows = data ?? [];
  const now = new Date();
  const todayKey = localDateKey(now, timezone);

  const key7 = new Set<string>();
  const key14ByDay = new Map<string, number>();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    key7.add(localDateKey(d, timezone));
  }
  const order14: string[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const k = localDateKey(d, timezone);
    order14.push(k);
    key14ByDay.set(k, 0);
  }

  let today = 0, last7 = 0, last30 = 0;
  const uniqToday = new Set<string>(), uniq7 = new Set<string>(), uniq30 = new Set<string>();

  for (const r of rows) {
    const k = localDateKey(new Date(r.created_at as string), timezone);
    last30 += 1;
    uniq30.add(r.visitor_id as string);
    if (key7.has(k)) { last7 += 1; uniq7.add(r.visitor_id as string); }
    if (k === todayKey) { today += 1; uniqToday.add(r.visitor_id as string); }
    if (key14ByDay.has(k)) key14ByDay.set(k, (key14ByDay.get(k) ?? 0) + 1);
  }

  const series14: DayVisits[] = order14.map((k, idx) => {
    let label = '·';
    try {
      const d = new Date(now);
      d.setDate(now.getDate() - (13 - idx));
      const short = d.toLocaleDateString('es', { weekday: 'short', timeZone: timezone });
      label = short.charAt(0).toUpperCase() + short.slice(1, 2);
    } catch {}
    return { label, visits: key14ByDay.get(k) ?? 0, isToday: k === todayKey };
  });

  return {
    today,
    uniqueToday: uniqToday.size,
    last7,
    unique7: uniq7.size,
    last30,
    unique30: uniq30.size,
    series14,
  };
}
