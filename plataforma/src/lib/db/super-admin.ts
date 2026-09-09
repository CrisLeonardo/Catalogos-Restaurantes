import { cache } from 'react';
import { createServiceClient } from '@/lib/supabase/service';
import type { MemberRole } from '@/lib/membership-roles';
import type { Organization, Profile, Restaurant, RestaurantTheme } from '@/types';

export type RestaurantRow = Restaurant & {
  restaurant_themes: RestaurantTheme[];
};

export type RestaurantUser = {
  id: string;
  email: string | null;
  role: Profile['role'];
  full_name: string | null;
  /**
   * ¿Aparece aquí por su MEMBRESÍA (migración 113) y no por
   * `profiles.restaurant_id`? Es el caso de todo dueño del modelo nuevo.
   *
   * Importa para una cosa: a esta persona se le puede reponer la contraseña
   * —que es el rescate— pero NO se le quita el acceso desde aquí. Su cuenta
   * puede ser la de un dueño con tres restaurantes, y borrar el usuario de
   * Auth desde la ficha de uno lo dejaría fuera de los tres.
   */
  viaMembership: boolean;
  /**
   * Su papel EN ESTE LOCAL, en el vocabulario de las membresías
   * (migración 113). `null` = solo cuelga de `profiles.restaurant_id`, el
   * camino viejo, y por tanto no hay fila que cambiarle ni quitarle.
   */
  memberRole: MemberRole | null;
};

export type GlobalMetrics = {
  total: number;
  active: number;
  suspended: number;
  /** Conteo por plan actual (BASICO/ESTANDAR/PREMIUM/PRO). */
  byPlan: Record<string, number>;
};

// PostgREST trata el embed restaurant_themes como UNO-A-UNO (restaurant_id es
// PK y FK a la vez), así que lo devuelve como objeto (o null), NO como array.
// Normalizamos a array para que `row.restaurant_themes[0]` funcione siempre.
function normalizeThemes(row: Record<string, unknown>): RestaurantRow {
  const rt = row.restaurant_themes;
  row.restaurant_themes = rt ? (Array.isArray(rt) ? rt : [rt]) : [];
  return row as unknown as RestaurantRow;
}

export const getAllRestaurants = cache(async (): Promise<RestaurantRow[]> => {
  const db = createServiceClient();
  const { data } = await db
    .from('restaurants')
    .select('*, restaurant_themes(*)')
    .order('created_at', { ascending: false });
  return (data ?? []).map((r) => normalizeThemes(r as Record<string, unknown>));
});

export const getRestaurantFullById = cache(
  async (id: string): Promise<RestaurantRow | null> => {
    const db = createServiceClient();
    const { data } = await db
      .from('restaurants')
      .select('*, restaurant_themes(*)')
      .eq('id', id)
      .single();
    return data ? normalizeThemes(data as Record<string, unknown>) : null;
  },
);

/**
 * Usuarios (logins) asociados a un restaurante: dueño y staff.
 * El email vive en auth.users, así que se resuelve con la Admin API
 * (service_role). El nº de usuarios por restaurante es pequeño.
 *
 * Se miran DOS sitios, y esto no es una optimización sino un arreglo:
 *
 *  · `profiles.restaurant_id` — el staff, y los dueños de antes del modelo
 *    de membresías;
 *  · `restaurant_members` (migración 113) — **todo dueño del modelo nuevo**.
 *    Desde que `signup.ts` crea el perfil con `restaurant_id: null` y el
 *    alta de restaurante no lo toca a propósito, mirar solo la primera
 *    columna dejaba esta pantalla SIN el dueño: quien más falta hace aquí,
 *    porque esta es la última salida cuando olvida su contraseña, no tiene
 *    Google y el envío de correo no está configurado. Comprobado contra la
 *    base: los restaurantes creados desde Mi cuenta salían sin dueño.
 */
export const getRestaurantUsers = cache(
  async (restaurantId: string): Promise<RestaurantUser[]> => {
    const db = createServiceClient();
    const [{ data: profiles }, { data: members }] = await Promise.all([
      db.from('profiles').select('id, role, full_name').eq('restaurant_id', restaurantId),
      db.from('restaurant_members').select('user_id, role').eq('restaurant_id', restaurantId).eq('status', 'active'),
    ]);

    // Su papel aquí según la membresía. Es lo que decide qué se le puede
    // cambiar y qué se le puede quitar: sin fila, no hay nada que tocar.
    const rolDeMembresia = new Map<string, MemberRole>(
      (members ?? []).map((m) => [m.user_id as string, m.role as MemberRole]),
    );

    const porPerfil = new Set((profiles ?? []).map((p) => p.id as string));
    // Solo los que NO salían ya por su perfil: quien está en los dos sitios
    // se cuenta una vez, y como lo que es (no "por membresía").
    const soloMembresia = (members ?? [])
      .map((m) => m.user_id as string)
      .filter((id) => !porPerfil.has(id));

    if (!porPerfil.size && !soloMembresia.length) return [];

    const { data: extra } = soloMembresia.length
      ? await db.from('profiles').select('id, role, full_name').in('id', soloMembresia)
      : { data: [] as { id: unknown; role: unknown; full_name: unknown }[] };

    const filas = [
      ...(profiles ?? []).map((p) => ({ p, viaMembership: false })),
      ...(extra ?? []).map((p) => ({ p, viaMembership: true })),
    ];

    const users = await Promise.all(
      filas.map(async ({ p, viaMembership }) => {
        const { data } = await db.auth.admin.getUserById(p.id as string);
        return {
          id: p.id as string,
          email: data.user?.email ?? null,
          role: p.role as Profile['role'],
          full_name: (p.full_name as string | null) ?? null,
          viaMembership,
          memberRole: rolDeMembresia.get(p.id as string) ?? null,
        };
      }),
    );

    // Dueños primero, luego staff; cada grupo por email.
    return users.sort((a, b) => {
      if (a.role !== b.role) return a.role === 'RESTAURANT_OWNER' ? -1 : 1;
      return (a.email ?? '').localeCompare(b.email ?? '');
    });
  },
);

/* ── Grupos / organizaciones (Fase E) ──────────────────────── */

export type OrganizationRow = Organization & { branchCount: number };

export const getAllOrganizations = cache(async (): Promise<OrganizationRow[]> => {
  const db = createServiceClient();
  const [{ data: orgs }, { data: rests }] = await Promise.all([
    db.from('organizations').select('*').order('created_at', { ascending: false }),
    db.from('restaurants').select('organization_id'),
  ]);
  const counts = new Map<string, number>();
  for (const r of rests ?? []) {
    const oid = r.organization_id as string | null;
    if (oid) counts.set(oid, (counts.get(oid) ?? 0) + 1);
  }
  return (orgs ?? []).map((o) => ({ ...(o as Organization), branchCount: counts.get(o.id as string) ?? 0 }));
});

export type OrgGroupOwner = { id: string; email: string | null; full_name: string | null };

export const getOrganizationDetail = cache(
  async (orgId: string): Promise<{
    org: Organization | null;
    branches: Restaurant[];
    available: Restaurant[];   // restaurantes sin grupo (asignables)
    owners: OrgGroupOwner[];
  }> => {
    const db = createServiceClient();
    const { data: org } = await db.from('organizations').select('*').eq('id', orgId).single();
    if (!org) return { org: null, branches: [], available: [], owners: [] };

    const [{ data: branches }, { data: available }, { data: ownerProfiles }] = await Promise.all([
      db.from('restaurants').select('*').eq('organization_id', orgId).order('name'),
      db.from('restaurants').select('*').is('organization_id', null).order('name'),
      db.from('profiles').select('id, full_name').eq('organization_id', orgId),
    ]);

    /* Los dueños del grupo salían SOLO de `profiles.organization_id`, y esa
       columna es la marca del grupo, no el acceso: quien administra los
       locales por membresía —un socio, el gerente al que invitaron— no
       aparecía aquí aunque entrara a los cinco. Se juntan las dos vías, igual
       que hace `getRestaurantUsers` con las personas de un local. */
    const idsSucursales = (branches ?? []).map((b) => b.id as string);
    const { data: dueñosPorMembresia } = idsSucursales.length
      ? await db
          .from('restaurant_members')
          .select('user_id')
          .in('restaurant_id', idsSucursales)
          .eq('role', 'OWNER')
          .eq('status', 'active')
      : { data: [] as { user_id: unknown }[] };

    const ids = new Set<string>((ownerProfiles ?? []).map((p) => p.id as string));
    for (const m of dueñosPorMembresia ?? []) ids.add(m.user_id as string);

    const nombrePorId = new Map<string, string | null>(
      (ownerProfiles ?? []).map((p) => [p.id as string, (p.full_name as string | null) ?? null]),
    );
    const faltanNombre = [...ids].filter((id) => !nombrePorId.has(id));
    if (faltanNombre.length) {
      const { data: extra } = await db.from('profiles').select('id, full_name').in('id', faltanNombre);
      for (const p of extra ?? []) nombrePorId.set(p.id as string, (p.full_name as string | null) ?? null);
    }

    const owners = await Promise.all(
      [...ids].map(async (id) => {
        const { data } = await db.auth.admin.getUserById(id);
        return { id, email: data.user?.email ?? null, full_name: nombrePorId.get(id) ?? null };
      }),
    );

    return {
      org: org as Organization,
      branches: (branches ?? []) as Restaurant[],
      available: (available ?? []) as Restaurant[],
      owners,
    };
  },
);

export const getGlobalMetrics = cache(async (): Promise<GlobalMetrics> => {
  const db = createServiceClient();
  const { data } = await db.from('restaurants').select('status, plan_actual');
  const rows = data ?? [];
  const byPlan: Record<string, number> = {};
  for (const r of rows) {
    const p = (r.plan_actual as string) || 'BASICO';
    byPlan[p] = (byPlan[p] ?? 0) + 1;
  }
  return {
    total: rows.length,
    active: rows.filter((r) => r.status === 'active').length,
    suspended: rows.filter((r) => r.status === 'suspended').length,
    byPlan,
  };
});

/* ── Serie diaria global de la plataforma (30 días) ─────────── */

export type PlatformSeriesPoint = { date: string; visits: number; orders: number };

/**
 * Actividad diaria de TODA la plataforma en los últimos 30 días (visitas y
 * pedidos por día, todos los tenants juntos). Para la gráfica del dashboard
 * del Super Admin. 2 queries.
 */
export const getPlatformDailySeries = cache(
  async (): Promise<PlatformSeriesPoint[]> => {
    const db = createServiceClient();
    const now = new Date();
    const since = new Date(now);
    since.setDate(since.getDate() - 30);
    const sinceIso = since.toISOString();

    const dayKeys: string[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      dayKeys.push(d.toISOString().slice(0, 10));
    }
    const map = new Map<string, PlatformSeriesPoint>(
      dayKeys.map((k) => [k, { date: k, visits: 0, orders: 0 }]),
    );

    const [{ data: visits }, { data: orders }] = await Promise.all([
      db.from('page_visits').select('created_at').gte('created_at', sinceIso).limit(100000),
      db.from('orders').select('created_at').neq('status', 'CANCEL').gte('created_at', sinceIso).limit(100000),
    ]);

    for (const v of visits ?? []) {
      const pt = map.get((v.created_at as string).slice(0, 10));
      if (pt) pt.visits += 1;
    }
    for (const o of orders ?? []) {
      const pt = map.get((o.created_at as string).slice(0, 10));
      if (pt) pt.orders += 1;
    }
    return dayKeys.map((k) => map.get(k)!);
  },
);

/* ── Visitas por restaurante (Super Admin) ─────────────────── */

export type RestaurantTraffic = {
  /** Visitas en los últimos 30 días. */
  visits30: number;
  /** Visitantes únicos en los últimos 30 días. */
  unique30: number;
  /** Pedidos en los últimos 30 días (sin cancelados). */
  orders30: number;
};

/**
 * Tráfico de TODOS los restaurantes (últimos 30 días) en 2 queries.
 * Para la página de métricas del Super Admin.
 */
export const getAllRestaurantsTraffic = cache(
  async (): Promise<Map<string, RestaurantTraffic>> => {
    const db = createServiceClient();
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const sinceIso = since.toISOString();

    const [{ data: visits }, { data: orders }] = await Promise.all([
      db
        .from('page_visits')
        .select('restaurant_id, visitor_id')
        .gte('created_at', sinceIso)
        .limit(100000),
      db
        .from('orders')
        .select('restaurant_id')
        .neq('status', 'CANCEL')
        .gte('created_at', sinceIso)
        .limit(100000),
    ]);

    const map = new Map<string, RestaurantTraffic>();
    const uniques = new Map<string, Set<string>>();

    for (const v of visits ?? []) {
      const id = v.restaurant_id as string;
      const t = map.get(id) ?? { visits30: 0, unique30: 0, orders30: 0 };
      t.visits30 += 1;
      map.set(id, t);
      let set = uniques.get(id);
      if (!set) { set = new Set(); uniques.set(id, set); }
      set.add(v.visitor_id as string);
    }
    for (const [id, set] of uniques) {
      const t = map.get(id);
      if (t) t.unique30 = set.size;
    }
    for (const o of orders ?? []) {
      const id = o.restaurant_id as string;
      const t = map.get(id) ?? { visits30: 0, unique30: 0, orders30: 0 };
      t.orders30 += 1;
      map.set(id, t);
    }
    return map;
  },
);

/* ── Métricas a fondo de UN restaurante (Super Admin) ──────── */

export type DeepSeriesPoint = { date: string; visits: number; orders: number; revenue: number };

export interface RestaurantDeepMetrics {
  /** Ventana actual (últimos 30 días). */
  visits30: number;
  unique30: number;
  orders30: number;
  /** Venta del restaurante (su negocio) en 30 días, sin cancelados. */
  revenue30: number;
  /** Ventana previa (30 días anteriores) para comparar crecimiento. */
  visitsPrev: number;
  ordersPrev: number;
  revenuePrev: number;
  /** Crecimiento % vs. ventana previa (null si la previa fue 0). */
  visitsGrowth: number | null;
  ordersGrowth: number | null;
  revenueGrowth: number | null;
  /** Conversión: pedidos / visitas (%). */
  conversion: number;
  /** Ticket promedio de sus pedidos. */
  avgTicket: number;
  /** Serie diaria de los últimos 30 días (para gráficas). */
  series: DeepSeriesPoint[];
}

const EMPTY_DEEP: RestaurantDeepMetrics = {
  visits30: 0, unique30: 0, orders30: 0, revenue30: 0,
  visitsPrev: 0, ordersPrev: 0, revenuePrev: 0,
  visitsGrowth: null, ordersGrowth: null, revenueGrowth: null,
  conversion: 0, avgTicket: 0, series: [],
};

function growth(curr: number, prev: number): number | null {
  if (prev <= 0) return null;
  return ((curr - prev) / prev) * 100;
}

/**
 * Métricas detalladas de un restaurante en 60 días (dos ventanas de 30
 * para comparar crecimiento) + serie diaria. Para la vista a fondo del
 * Super Admin (/super/metricas/[id]) y decidir cuánto cobrarle.
 */
export const getRestaurantDeepMetrics = cache(
  async (restaurantId: string): Promise<RestaurantDeepMetrics> => {
    const db = createServiceClient();
    const now = new Date();
    const start60 = new Date(now); start60.setDate(start60.getDate() - 60);
    const split = new Date(now); split.setDate(split.getDate() - 30);
    const start60Iso = start60.toISOString();
    const splitMs = split.getTime();

    const [{ data: visits }, { data: orders }] = await Promise.all([
      db.from('page_visits')
        .select('visitor_id, created_at')
        .eq('restaurant_id', restaurantId)
        .gte('created_at', start60Iso)
        .limit(100000),
      db.from('orders')
        .select('total, created_at')
        .eq('restaurant_id', restaurantId)
        .neq('status', 'CANCEL')
        .gte('created_at', start60Iso)
        .limit(100000),
    ]);

    if (!visits?.length && !orders?.length) return EMPTY_DEEP;

    // Serie diaria de los últimos 30 días.
    const dayKeys: string[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      dayKeys.push(d.toISOString().slice(0, 10));
    }
    const seriesMap = new Map<string, DeepSeriesPoint>(
      dayKeys.map((k) => [k, { date: k, visits: 0, orders: 0, revenue: 0 }]),
    );

    const uniques = new Set<string>();
    let visits30 = 0, visitsPrev = 0;
    for (const v of visits ?? []) {
      const t = new Date(v.created_at as string).getTime();
      if (t >= splitMs) {
        visits30 += 1;
        uniques.add(v.visitor_id as string);
        const k = (v.created_at as string).slice(0, 10);
        const pt = seriesMap.get(k); if (pt) pt.visits += 1;
      } else visitsPrev += 1;
    }

    let orders30 = 0, ordersPrev = 0, revenue30 = 0, revenuePrev = 0;
    for (const o of orders ?? []) {
      const t = new Date(o.created_at as string).getTime();
      const amt = Number(o.total ?? 0);
      if (t >= splitMs) {
        orders30 += 1; revenue30 += amt;
        const k = (o.created_at as string).slice(0, 10);
        const pt = seriesMap.get(k); if (pt) { pt.orders += 1; pt.revenue += amt; }
      } else { ordersPrev += 1; revenuePrev += amt; }
    }

    return {
      visits30,
      unique30: uniques.size,
      orders30,
      revenue30,
      visitsPrev,
      ordersPrev,
      revenuePrev,
      visitsGrowth: growth(visits30, visitsPrev),
      ordersGrowth: growth(orders30, ordersPrev),
      revenueGrowth: growth(revenue30, revenuePrev),
      conversion: visits30 > 0 ? (orders30 / visits30) * 100 : 0,
      avgTicket: orders30 > 0 ? revenue30 / orders30 : 0,
      series: dayKeys.map((k) => seriesMap.get(k)!),
    };
  },
);
