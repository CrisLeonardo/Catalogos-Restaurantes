import { cache } from 'react';
import { getStaffUser } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getMyMemberships } from '@/lib/db/membership';
import { withPlanFloor, PLAN_ORDER, type PlanCode } from '@/lib/plans';
import { adminUrl } from '@/lib/tenant';
import { getOrderStats } from '@/lib/db/orders';
import { getSalesReport, type SalesReport } from '@/lib/db/reports';
import type { Organization, Restaurant } from '@/types';

/* ============================================================
   GRUPO — capa de datos del panel consolidado
   ------------------------------------------------------------
   "Grupo" es, desde hoy, una cosa que se deduce: **tener más de un
   restaurante propio**. No hace falta que exista una fila en
   `organizations`, ni que Leogin la cree, ni un rol aparte.

   Antes era al revés y ahí estaba el hueco que el usuario notó: el panel
   consolidado solo se encendía si `profiles.organization_id` estaba puesto,
   y la única forma de ponerlo era un ticket a Leogin. Con el alta de
   restaurantes ya en manos del dueño (Mi cuenta), eso dejaba a casi todo el
   mundo viendo únicamente su lista de restaurantes y ningún dato junto.

   La organización sigue existiendo, pero para lo que sí es suyo: la marca
   del grupo en los reportes y el link único de pedidos (`grupo.dominio`).
   Ver lib/db/organizations.ts.
   ============================================================ */

export type GroupScope = {
  /** Los restaurantes propios, por nombre. */
  branches: Restaurant[];
  /** La organización, si esta cuenta ya tiene una (marca + link del grupo). */
  org: Organization | null;
  /** Nombre a mostrar: el del grupo, o el del restaurante si es uno solo. */
  name: string;
  userId: string;
  /** Hay VARIOS restaurantes que comparar entre sí. Con uno no hay grupo,
      pero sí hay resumen y finanzas: ver la marcha del negocio de un vistazo
      no es una función de cadena. */
  isGroup: boolean;
  /**
   * Al menos un restaurante propio trae los reportes financieros.
   *
   * Es una función de PAGO (Estándar en adelante, ver plans.ts): mirarla
   * desde aquí no puede ser la puerta de atrás que la regala a quien está en
   * el plan gratis. Se mide igual que el panel de cada restaurante —módulo
   * `finanzas` efectivo y `orders` activo— porque el reporte se construye
   * con los pedidos.
   */
  hasFinance: boolean;
  /** A dónde mandar a quien no la tiene: la suscripción de su restaurante. */
  upgradeUrl: string | null;
};

/** Módulos efectivos de un restaurante (plan + lo que Leogin le habilitó). */
function effectiveModules(b: Restaurant): Record<string, boolean> {
  const plan = ((PLAN_ORDER as string[]).includes(b.plan_actual) ? b.plan_actual : 'BASICO') as PlanCode;
  return withPlanFloor(plan, (b.modules as unknown as Record<string, boolean> | null) ?? {});
}

/**
 * Qué restaurantes propios tiene quien está dentro, y bajo qué marca.
 *
 * Fuente de verdad: las membresías de DUEÑO. Un gerente invitado a dos
 * sucursales no ve el consolidado de su jefe — igual que antes, pero ahora
 * la regla se lee en un solo sitio.
 *
 * Se suman también los restaurantes de su organización, si tiene: los grupos
 * que Leogin armó a mano antes de este cambio podían tener al jefe SIN
 * membresías (solo `organization_id`), y esa gente no puede quedarse fuera
 * de su propio panel por un detalle de cómo se dio de alta.
 */
export const getMyGroupScope = cache(async (): Promise<GroupScope | null> => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;

  const { data: { user } } = await getStaffUser();
  if (!user) return null;

  const db = createServiceClient();
  const [{ data: profile }, memberships] = await Promise.all([
    db.from('profiles').select('full_name, organization_id').eq('id', user.id).maybeSingle(),
    getMyMemberships(),
  ]);

  const ownedIds = memberships.filter((m) => m.role === 'OWNER').map((m) => m.restaurantId);
  const orgId = (profile?.organization_id as string | null) ?? null;
  if (ownedIds.length === 0 && !orgId) return null;

  const [byMembership, byOrg] = await Promise.all([
    ownedIds.length > 0
      ? db.from('restaurants').select('*').in('id', ownedIds)
      : Promise.resolve({ data: [] as Restaurant[] }),
    orgId
      ? db.from('restaurants').select('*').eq('organization_id', orgId)
      : Promise.resolve({ data: [] as Restaurant[] }),
  ]);

  const byId = new Map<string, Restaurant>();
  for (const r of [...(byMembership.data ?? []), ...(byOrg.data ?? [])]) {
    byId.set((r as Restaurant).id, r as Restaurant);
  }
  const branches = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  if (branches.length === 0) return null;

  const { data: org } = orgId
    ? await db.from('organizations').select('*').eq('id', orgId).maybeSingle()
    : { data: null };

  const fullName = (profile?.full_name as string | null) ?? null;
  const isGroup = branches.length >= 2;

  const withFinance = branches.filter((b) => {
    const mods = effectiveModules(b);
    return mods.finanzas === true && mods.orders === true;
  });

  return {
    branches,
    org: (org as Organization | null) ?? null,
    name: (org?.name as string | undefined)
      ?? (isGroup
        ? (fullName ? `Restaurantes de ${fullName}` : 'Mis restaurantes')
        : branches[0].name),
    userId: user.id,
    isGroup,
    hasFinance: withFinance.length > 0,
    upgradeUrl: `${adminUrl(branches[0].slug)}/suscripcion`,
  };
});

/* ── Dashboard consolidado ──────────────────────────────────── */

export type BranchKpi = {
  id: string;
  name: string;
  slug: string;
  todaySales: number;
  todayOrders: number;
  todayTicket: number;
  sales14: number;
  paused: boolean;
  lowStock: number;
  outStock: number;
};

export interface GroupDashboard {
  totalTodaySales: number;
  totalTodayOrders: number;
  avgTicket: number;
  sales14: number;
  branchCount: number;
  branches: BranchKpi[];
  best: BranchKpi | null;
}

export async function getGroupDashboard(branches: Restaurant[]): Promise<GroupDashboard> {
  const ids = branches.map((b) => b.id);
  const empty: GroupDashboard = { totalTodaySales: 0, totalTodayOrders: 0, avgTicket: 0, sales14: 0, branchCount: branches.length, branches: [], best: null };
  if (ids.length === 0) return empty;

  // Stats de ventas por sucursal (cada una en su zona horaria) en paralelo.
  const stats = await Promise.all(
    branches.map((b) => getOrderStats(b.id, b.timezone || 'America/Guatemala')),
  );

  // Stock bajo / agotado de todas las sucursales en una sola consulta.
  const db = createServiceClient();
  const { data: prods } = await db
    .from('products')
    .select('restaurant_id, stock, low_stock_threshold, track_stock')
    .in('restaurant_id', ids)
    .eq('track_stock', true);

  const lowMap = new Map<string, { low: number; out: number }>();
  for (const p of prods ?? []) {
    const rid = p.restaurant_id as string;
    const s = Number(p.stock ?? 0);
    const e = lowMap.get(rid) ?? { low: 0, out: 0 };
    if (s <= 0) e.out += 1; else if (s <= Number(p.low_stock_threshold ?? 0)) e.low += 1;
    lowMap.set(rid, e);
  }

  const branchKpis: BranchKpi[] = branches.map((b, i) => {
    const st = stats[i];
    const ls = lowMap.get(b.id) ?? { low: 0, out: 0 };
    return {
      id: b.id, name: b.name, slug: b.slug,
      todaySales: st.todaySales, todayOrders: st.todayOrders, todayTicket: st.todayTicket,
      sales14: st.totalLast14,
      paused: b.orders_paused === true,
      lowStock: ls.low, outStock: ls.out,
    };
  });

  const totalTodaySales = branchKpis.reduce((s, b) => s + b.todaySales, 0);
  const totalTodayOrders = branchKpis.reduce((s, b) => s + b.todayOrders, 0);
  const sales14 = branchKpis.reduce((s, b) => s + b.sales14, 0);
  const best = branchKpis.length ? branchKpis.reduce((a, b) => (b.todaySales > a.todaySales ? b : a)) : null;

  return {
    totalTodaySales,
    totalTodayOrders,
    avgTicket: totalTodayOrders > 0 ? totalTodaySales / totalTodayOrders : 0,
    sales14,
    branchCount: branches.length,
    branches: branchKpis.sort((a, b) => b.todaySales - a.todaySales),
    best,
  };
}

/* ── Reporte consolidado por rango ──────────────────────────── */

export type GroupReport = {
  totalRevenue: number;
  totalOrders: number;
  totalProfit: number;
  perBranch: { id: string; name: string; revenue: number; orders: number; profit: number }[];
  combinedSeries: { date: string; label: string; revenue: number }[];
};

export async function getGroupReport(branches: Restaurant[], from: string, to: string): Promise<GroupReport> {
  const reports = await Promise.all(
    branches.map((b) => getSalesReport(b.id, from, to, b.timezone || 'America/Guatemala')),
  );

  const perBranch = branches.map((b, i) => ({
    id: b.id, name: b.name,
    revenue: reports[i].revenue, orders: reports[i].orders, profit: reports[i].profit,
  })).sort((a, b) => b.revenue - a.revenue);

  // Serie combinada por fecha (suma de todas las sucursales).
  const byDate = new Map<string, { label: string; revenue: number }>();
  for (const r of reports as SalesReport[]) {
    for (const d of r.series) {
      const e = byDate.get(d.date) ?? { label: d.label, revenue: 0 };
      e.revenue += d.revenue;
      byDate.set(d.date, e);
    }
  }
  const combinedSeries = [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => ({ date, label: v.label, revenue: v.revenue }));

  return {
    totalRevenue: perBranch.reduce((s, b) => s + b.revenue, 0),
    totalOrders: perBranch.reduce((s, b) => s + b.orders, 0),
    totalProfit: perBranch.reduce((s, b) => s + b.profit, 0),
    perBranch,
    combinedSeries,
  };
}
