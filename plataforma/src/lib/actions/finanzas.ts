'use server';

/* ============================================================
   FINANZAS — Corte de caja + export de reportes (Fase A)
   ------------------------------------------------------------
   · getCashSummary:       efectivo esperado HOY (por método de pago).
   · saveCashCount:        guarda arqueo con desglose por denominaciones.
   · getCashHistory:       últimos cortes del restaurante.
   · deleteCashCount:      elimina un corte si tiene menos de 24 h.
   · exportSalesReportXlsx: reporte de ventas del rango a .xlsx.
   · getSalesReportData:   datos del reporte para PDF en el cliente.
   Todo pasa por service role tras validar el rol del usuario.
   ============================================================ */

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveGroupBranchId } from '@/lib/db/admin';
import { can } from '@/lib/permissions';
import { revalidatePath } from 'next/cache';
import { localDateKey } from '@/lib/hours';
import { getSalesReport } from '@/lib/db/reports';
import type { SalesReport } from '@/lib/db/reports';
import { DENOM_FIELDS } from '@/lib/finanzas-constants';

const UUID_RE = /^[0-9a-f-]{36}$/i;

/**
 * Valida que el usuario autenticado pueda operar ESTE restaurante.
 * Devuelve el client service-role + la zona horaria, o null si no autorizado.
 */
async function authRestaurant(restaurantId: string): Promise<{
  db: ReturnType<typeof createServiceClient>;
  tz: string;
  userId: string;
  cashierName: string | null;
} | null> {
  if (!UUID_RE.test(restaurantId)) return null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, restaurant_id, permissions, full_name')
    .eq('id', user.id)
    .single();

  const belongs =
    profile?.role === 'SUPER_ADMIN' ||
    (['RESTAURANT_OWNER', 'RESTAURANT_STAFF'].includes(profile?.role ?? '') &&
      profile?.restaurant_id === restaurantId) ||
    (profile?.role === 'GROUP_OWNER' && (await resolveGroupBranchId()) === restaurantId);
  if (!belongs) return null;
  if (!can(profile?.role, profile?.permissions as string[] | null, 'finanzas')) return null;

  const db = createServiceClient();
  const { data: r } = await db
    .from('restaurants')
    .select('timezone')
    .eq('id', restaurantId)
    .single();

  return {
    db,
    tz: (r?.timezone as string) || 'America/Guatemala',
    userId: user.id,
    cashierName: (profile?.full_name as string) || null,
  };
}

export interface CashSummary {
  date: string;
  expectedCash: number;
  byMethod: Record<string, number>;
  orders: number;
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

  return { date: todayKey, expectedCash: byMethod.CASH ?? 0, byMethod, orders, totalSales };
}

export type CashCount = {
  id: string;
  business_date: string;
  opening_float: number;
  expected_cash: number;
  counted_cash: number;
  difference: number;
  by_method: Record<string, number> | null;
  denomination_breakdown: Record<string, number> | null;
  shift_label: string | null;
  cashier_name: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
};

export async function getCashHistory(
  restaurantId: string,
  limit = 30,
): Promise<CashCount[]> {
  const ctx = await authRestaurant(restaurantId);
  if (!ctx) return [];
  const { data } = await ctx.db
    .from('cash_counts')
    .select('id, business_date, opening_float, expected_cash, counted_cash, difference, by_method, denomination_breakdown, shift_label, cashier_name, notes, created_at, created_by')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));
  return (data ?? []) as CashCount[];
}

export type CashState = { error: string } | { ok: true } | null;

/** Guarda un arqueo de caja con desglose opcional por denominaciones. */
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

  // Calcular total contado desde el desglose por denominaciones.
  // Si no se ingresó ninguna denominación, usar el campo manual counted_cash.
  const breakdown: Record<string, number> = {};
  let denCentavos = 0;
  for (const { field, centavos } of DENOM_FIELDS) {
    const n = Math.max(0, parseInt(String(formData.get(field) ?? '0')) || 0);
    breakdown[field] = n;
    denCentavos += n * centavos;
  }
  const hasDenominations = denCentavos > 0;
  const counted = hasDenominations
    ? Math.round(denCentavos) / 100
    : Math.max(0, num('counted_cash'));

  const shiftLabel = (formData.get('shift_label') as string)?.trim() || null;
  const notes      = (formData.get('notes') as string)?.trim() || null;

  // El esperado se recalcula en el servidor (no se confía en el cliente).
  const summary = await getCashSummary(restaurantId);
  const expected = summary.expectedCash;
  const difference = counted - (opening + expected);

  const { error } = await ctx.db.from('cash_counts').insert({
    restaurant_id:          restaurantId,
    business_date:          summary.date,
    opening_float:          opening,
    expected_cash:          expected,
    counted_cash:           counted,
    difference,
    by_method:              summary.byMethod,
    denomination_breakdown: hasDenominations ? breakdown : null,
    shift_label:            shiftLabel,
    cashier_name:           ctx.cashierName,
    notes,
    created_by:             ctx.userId,
  });

  if (error) return { error: error.message };

  revalidatePath('/admin/finanzas');
  return { ok: true };
}

/** Elimina un corte de caja siempre que tenga menos de 24 horas. */
export async function deleteCashCount(
  id: string,
  restaurantId: string,
): Promise<{ ok: true } | { error: string }> {
  if (!UUID_RE.test(id) || !UUID_RE.test(restaurantId)) {
    return { error: 'Parámetros inválidos.' };
  }

  const ctx = await authRestaurant(restaurantId);
  if (!ctx) return { error: 'No autorizado.' };

  const { data: record, error: fetchErr } = await ctx.db
    .from('cash_counts')
    .select('id, created_at')
    .eq('id', id)
    .eq('restaurant_id', restaurantId)
    .single();

  if (fetchErr || !record) return { error: 'Corte no encontrado.' };

  const ageMs = Date.now() - new Date(record.created_at as string).getTime();
  if (ageMs > 24 * 60 * 60 * 1000) {
    return { error: 'Solo puedes eliminar cortes de las últimas 24 horas.' };
  }

  const { error } = await ctx.db.from('cash_counts').delete().eq('id', id);
  if (error) return { error: error.message };

  revalidatePath('/admin/finanzas');
  return { ok: true };
}

/* ── Export del reporte de ventas ───────────────────────────── */

export async function getSalesReportData(
  restaurantId: string,
  from: string,
  to: string,
): Promise<{ report?: SalesReport; error?: string }> {
  const ctx = await authRestaurant(restaurantId);
  if (!ctx) return { error: 'No autorizado.' };
  const report = await getSalesReport(restaurantId, from, to, ctx.tz);
  return { report };
}

export async function exportSalesReportXlsx(
  restaurantId: string,
  from: string,
  to: string,
): Promise<{ xlsx?: string; filename?: string; error?: string }> {
  const ctx = await authRestaurant(restaurantId);
  if (!ctx) return { error: 'No autorizado.' };

  const report = await getSalesReport(restaurantId, from, to, ctx.tz);

  const { Workbook } = await import('exceljs');
  const wb = new Workbook();

  const ws1 = wb.addWorksheet('Resumen');
  ws1.addRows([
    ['Reporte de Ventas', `${from} a ${to}`],
    [],
    ['Métrica', 'Valor'],
    ['Pedidos', report.orders],
    ['Ingreso bruto', report.revenue],
    ['Ingreso productos', report.productRevenue],
    ['Envíos', report.deliveryRevenue],
    ['Costo', report.cost],
    ['Utilidad', report.profit],
    ['Margen %', report.marginPct != null ? `${report.marginPct.toFixed(1)}%` : 'n/d'],
    ['Ticket promedio', report.avgTicket],
  ]);

  const ws2 = wb.addWorksheet('Ventas por día');
  ws2.addRow(['Fecha', 'Pedidos', 'Ingreso']);
  ws2.addRows(report.series.map((d) => [d.date, d.orders, d.revenue]));

  const ws3 = wb.addWorksheet('Productos');
  ws3.addRow(['Producto', 'Cantidad', 'Ingreso', 'Costo', 'Utilidad']);
  ws3.addRows(report.topByRevenue.map((p) => [p.name, p.qty, p.revenue, p.cost, p.profit]));

  const buf = await wb.xlsx.writeBuffer();
  const xlsx = Buffer.from(buf).toString('base64');
  return { xlsx, filename: `reporte-ventas-${from}_a_${to}.xlsx` };
}
