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
import { resolveEffectiveRole } from '@/lib/db/membership';
import { createServiceClient } from '@/lib/supabase/service';
import { headers } from 'next/headers';
import { rateLimit, clientIp } from '@/lib/rate-limit';

const UUID_RE = /^[0-9a-f-]{36}$/i;
const PATH_RE = /^\/[\w\-/[\]%.]*$/;

export async function trackVisit(
  restaurantId: string,
  visitorId: string,
  path: string,
): Promise<void> {
  if (!UUID_RE.test(restaurantId) || !UUID_RE.test(visitorId)) return;
  const safePath = PATH_RE.test(path) ? path.slice(0, 120) : '/';

  // Rate-limit: evita inflar métricas / llenar la tabla desde una misma IP.
  const ip = clientIp(await headers());
  if (!(await rateLimit(`visit:${ip}:${restaurantId}`, 40, 60_000))) return;

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
  /** Fecha local «2026-09-28». */
  date: string;
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

  // Qué es esta persona EN ESTE restaurante. Mirar solo el perfil dejaba
  // fuera al dueño del modelo de membresías, que lo tiene en null; y el rol
  // se toma también del efectivo para no abrirle esto a quien es personal de
  // OTRO restaurante y aquí solo es mesero.
  const efectivo = await resolveEffectiveRole(
    { role: profile?.role ?? null, permissions: null },
    restaurantId,
  );
  const allowed =
    profile?.role === 'SUPER_ADMIN' ||
    (['RESTAURANT_OWNER', 'RESTAURANT_STAFF'].includes(efectivo.role) &&
      (efectivo.isMember || profile?.restaurant_id === restaurantId));
  if (!allowed) return EMPTY_VISIT_STATS;

  // La agregación se hace en SQL (RPC visit_stats, migración 017): la BD
  // devuelve solo el resumen, no decenas de miles de filas. Los cortes de día
  // usan la zona horaria del restaurante.
  const db = createServiceClient();
  const { data } = await db.rpc('visit_stats', {
    p_restaurant_id: restaurantId,
    p_tz: timezone,
  });
  if (!data) return EMPTY_VISIT_STATS;

  const r = data as {
    today: number; uniqueToday: number;
    last7: number; unique7: number;
    last30: number; unique30: number;
    series14: { day: string; visits: number; is_today: boolean }[];
  };

  const series14: DayVisits[] = (r.series14 ?? []).map(({ day, visits, is_today }) => {
    // `day` ya es la fecha local (YYYY-MM-DD); su inicial de día de semana se
    // obtiene formateando el mediodía UTC de esa fecha (independiente del runtime).
    let label = '·';
    try {
      const short = new Date(`${day}T12:00:00Z`).toLocaleDateString('es', {
        weekday: 'short', timeZone: 'UTC',
      });
      label = short.charAt(0).toUpperCase() + short.slice(1, 2);
    } catch {}
    return { label, date: day, visits: Number(visits), isToday: is_today };
  });

  return {
    today: Number(r.today),
    uniqueToday: Number(r.uniqueToday),
    last7: Number(r.last7),
    unique7: Number(r.unique7),
    last30: Number(r.last30),
    unique30: Number(r.unique30),
    series14,
  };
}
