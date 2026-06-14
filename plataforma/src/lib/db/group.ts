import { cache } from 'react';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getOrderStats } from '@/lib/db/orders';
import { getSalesReport, type SalesReport } from '@/lib/db/reports';
import type { Organization, Restaurant } from '@/types';

/* ============================================================
   PANEL DE GRUPO — capa de datos (Fase E)
   El GROUP_OWNER ve consolidado de todas sus sucursales.
   Auth: GROUP_OWNER por su organization_id; SUPER_ADMIN por x-org-slug.
   ============================================================ */

export type GroupContext = {
  org: Organization;
  branches: Restaurant[];
  userId: string;
  role: string;
};

export const getGroupContext = cache(async (): Promise<GroupContext | null> => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, organization_id')
    .eq('id', user.id)
    .single();
  if (!profile) return null;

  const db = createServiceClient();
  let orgId: string | null = null;

  if (profile.role === 'GROUP_OWNER') {
    orgId = profile.organization_id as string | null;
  } else if (profile.role === 'SUPER_ADMIN') {
    const slug = (await headers()).get('x-org-slug');
    if (slug) {
      const { data: o } = await db.from('organizations').select('id').eq('slug', slug).maybeSingle();
      orgId = (o?.id as string) ?? null;
    }
  }
  if (!orgId) return null;

  const { data: org } = await db.from('organizations').select('*').eq('id', orgId).single();
  if (!org) return null;

  const { data: branches } = await db
    .from('restaurants')
    .select('*')
    .eq('organization_id', orgId)
    .order('name', { ascending: true });

  return { org: org as Organization, branches: (branches ?? []) as Restaurant[], userId: user.id, role: profile.role };
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
