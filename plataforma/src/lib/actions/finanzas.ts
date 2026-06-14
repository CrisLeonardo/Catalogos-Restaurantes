'use server';

/* ============================================================
   FINANZAS — Corte de caja + export de reportes (Fase A)
   ------------------------------------------------------------
   · getCashSummary:   efectivo esperado HOY (por método de pago).
   · saveCashCount:    guarda un corte de caja (esperado vs contado).
   · getCashHistory:   últimos cortes del restaurante.
   · exportSalesReportCsv: reporte de ventas del rango a CSV (Excel).
   Todo pasa por service role tras validar el rol del usuario.
   ============================================================ */

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { revalidatePath } from 'next/cache';
import { localDateKey } from '@/lib/hours';
import { getSalesReport } from '@/lib/db/reports';

const UUID_RE = /^[0-9a-f-]{36}$/i;

/**
 * Valida que el usuario autenticado pueda operar ESTE restaurante.
 * Devuelve el client service-role + la zona horaria, o null si no autorizado.
 */
async function authRestaurant(
  restaurantId: string,
): Promise<{ db: ReturnType<typeof createServiceClient>; tz: string; userId: string } | null> {
  if (!UUID_RE.test(restaurantId)) return null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, restaurant_id')
    .eq('id', user.id)
    .single();

  const allowed =
    profile?.role === 'SUPER_ADMIN' ||
    (['RESTAURANT_OWNER', 'RESTAURANT_STAFF'].includes(profile?.role ?? '') &&
      profile?.restaurant_id === restaurantId);
  if (!allowed) return null;

  const db = createServiceClient();
  const { data: r } = await db
    .from('restaurants')
    .select('timezone')
    .eq('id', restaurantId)
    .single();

  return { db, tz: (r?.timezone as string) || 'America/Guatemala', userId: user.id };
}

export interface CashSummary {
  /** Fecha local (YYYY-MM-DD) del corte. */
  date: string;
  /** Efectivo esperado hoy (pedidos en efectivo, sin cancelados). */
  expectedCash: number;
  /** Desglose por método de pago: { CASH: monto, ... }. */
  byMethod: Record<string, number>;
  /** Total de pedidos del día (sin cancelados). */
  orders: number;
  /** Venta total del día (todos los métodos). */
  totalSales: number;
}

const EMPTY_SUMMARY = (date: string): CashSummary => ({
  date, expectedCash: 0, byMethod: {}, orders: 0, totalSales: 0,
});

/** Resumen de caja de HOY (zona horaria del restaurante). */
export async function getCashSummary(restaurantId: string): Promise<CashSummary> {
  const ctx = await authRestaurant(restaurantId);
  const todayGuess = new Date().toISOString().slice(0, 10);
  if (!ctx) return EMPTY_SUMMARY(todayGuess);

  const { db, tz } = ctx;
  const todayKey = localDateKey(new Date(), tz);

  // Margen de ±1 día para cubrir desfase UTC↔local; filtramos por clave local.
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 1);

  const { data } = await db
    .from('orders')
    .select('created_at, payment_method, total')
    .eq('restaurant_id', restaurantId)
    .neq('status', 'CANCEL')
    .gte('created_at', since.toISOString())
    .limit(5000);

  const byMethod: Record<string, number> = {};
  let orders = 0, totalSales = 0;
  for (const o of data ?? []) {
    if (localDateKey(new Date(o.created_at as string), tz) !== todayKey) continue;
    const pm = ((o.payment_method as string) || 'CASH').toUpperCase();
    byMethod[pm] = (byMethod[pm] ?? 0) + Number(o.total);
    totalSales += Number(o.total);
    orders += 1;
  }

  return {
    date: todayKey,
    expectedCash: byMethod.CASH ?? 0,
    byMethod,
    orders,
    totalSales,
  };
}

export type CashCount = {
  id: string;
  business_date: string;
  opening_float: number;
  expected_cash: number;
  counted_cash: number;
  difference: number;
  by_method: Record<string, number> | null;
  notes: string | null;
  created_at: string;
};

export async function getCashHistory(
  restaurantId: string,
  limit = 30,
): Promise<CashCount[]> {
  const ctx = await authRestaurant(restaurantId);
  if (!ctx) return [];
  const { data } = await ctx.db
    .from('cash_counts')
    .select('id, business_date, opening_float, expected_cash, counted_cash, difference, by_method, notes, created_at')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));
  return (data ?? []) as CashCount[];
}

export type CashState = { error: string } | { ok: true } | null;

/** Guarda un corte de caja del día (esperado capturado como snapshot). */
export async function saveCashCount(
  prevState: CashState,
  formData: FormData,
): Promise<CashState> {
  const restaurantId = (formData.get('restaurantId') as string)?.trim();
  const ctx = await authRestaurant(restaurantId);
  if (!ctx) return { error: 'No autorizado.' };

  const num = (key: string) => {
    const n = parseFloat(String(formData.get(key) ?? ''));
    return isNaN(n) ? 0 : n;
  };

  const opening = Math.max(0, num('opening_float'));
  const counted = Math.max(0, num('counted_cash'));

  // El esperado se recalcula en el servidor (no se confía en el cliente).
  const summary = await getCashSummary(restaurantId);
  const expected = summary.expectedCash;
  const difference = counted - (opening + expected);

  const { error } = await ctx.db.from('cash_counts').insert({
    restaurant_id: restaurantId,
    business_date: summary.date,
    opening_float: opening,
    expected_cash: expected,
    counted_cash: counted,
    difference,
    by_method: summary.byMethod,
    notes: (formData.get('notes') as string)?.trim() || null,
    created_by: ctx.userId,
  });

  if (error) return { error: error.message };

  revalidatePath('/admin/finanzas');
  return { ok: true };
}

/* ── Export del reporte de ventas a CSV (Excel) ────────────── */

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Exporta el reporte de ventas del rango como CSV (BOM para Excel). */
export async function exportSalesReportCsv(
  restaurantId: string,
  from: string,
  to: string,
): Promise<{ csv?: string; filename?: string; error?: string }> {
  const ctx = await authRestaurant(restaurantId);
  if (!ctx) return { error: 'No autorizado.' };

  const report = await getSalesReport(restaurantId, from, to, ctx.tz);

  const lines: string[][] = [];
  lines.push(['Reporte de ventas', `${from} a ${to}`]);
  lines.push([]);
  lines.push(['Resumen', '']);
  lines.push(['Pedidos', String(report.orders)]);
  lines.push(['Ingreso bruto', report.revenue.toFixed(2)]);
  lines.push(['Ingreso productos', report.productRevenue.toFixed(2)]);
  lines.push(['Envíos', report.deliveryRevenue.toFixed(2)]);
  lines.push(['Costo', report.cost.toFixed(2)]);
  lines.push(['Utilidad', report.profit.toFixed(2)]);
  lines.push(['Margen %', report.marginPct != null ? report.marginPct.toFixed(1) : 'n/d']);
  lines.push(['Ticket promedio', report.avgTicket.toFixed(2)]);
  lines.push([]);
  lines.push(['Ventas por día', '']);
  lines.push(['Fecha', 'Pedidos', 'Ingreso']);
  for (const d of report.series) lines.push([d.date, String(d.orders), d.revenue.toFixed(2)]);
  lines.push([]);
  lines.push(['Productos (por ingreso)', '']);
  lines.push(['Producto', 'Cantidad', 'Ingreso', 'Costo', 'Utilidad']);
  for (const p of report.topByRevenue) {
    lines.push([p.name, String(p.qty), p.revenue.toFixed(2), p.cost.toFixed(2), p.profit.toFixed(2)]);
  }

  const csv = '﻿' + lines.map((r) => r.map(csvCell).join(',')).join('\r\n');
  return { csv, filename: `reporte-ventas-${from}_a_${to}.csv` };
}
