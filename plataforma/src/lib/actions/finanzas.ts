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
import { canActOnGroupBranch } from '@/lib/db/admin';
import { can } from '@/lib/permissions';
import { revalidatePath } from 'next/cache';
import { localDateKey } from '@/lib/hours';
import { getSalesReport } from '@/lib/db/reports';
import type { SalesReport, Split } from '@/lib/db/reports';
import { DENOM_FIELDS } from '@/lib/finanzas-constants';
import { resolveRestaurantBranding } from '@/lib/documents/branding';
import {
  createBrandedWorkbook, addBrandedHeader, styleTableHeaderRow, freezeHeaderRow,
  writeStyledTable, autoFitColumns, setCurrencyCell, PERCENT_NUM_FMT, workbookToBase64,
} from '@/lib/documents/excel';
import { formatDateRangeLabel, longDate } from '@/lib/documents/format';
import type { DocumentBranding } from '@/lib/documents/types';

const UUID_RE = /^[0-9a-f-]{36}$/i;

/**
 * Valida que el usuario autenticado pueda operar ESTE restaurante.
 * Devuelve el client service-role + la zona horaria, o null si no autorizado.
 */
async function authRestaurant(restaurantId: string): Promise<{
  db: ReturnType<typeof createServiceClient>;
  tz: string;
  slug: string;
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
    (await canActOnGroupBranch(restaurantId));
  if (!belongs) return null;
  if (!can(profile?.role, profile?.permissions as string[] | null, 'finanzas')) return null;

  const db = createServiceClient();
  const { data: r } = await db
    .from('restaurants')
    .select('timezone, slug')
    .eq('id', restaurantId)
    .single();

  return {
    db,
    tz: (r?.timezone as string) || 'America/Guatemala',
    slug: (r?.slug as string) || 'restaurante',
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
): Promise<{ report?: SalesReport; branding?: DocumentBranding; error?: string }> {
  const ctx = await authRestaurant(restaurantId);
  if (!ctx) return { error: 'No autorizado.' };
  const [report, branding] = await Promise.all([
    getSalesReport(restaurantId, from, to, ctx.tz),
    resolveRestaurantBranding(restaurantId),
  ]);
  return { report, branding };
}

export async function exportSalesReportXlsx(
  restaurantId: string,
  from: string,
  to: string,
): Promise<{ xlsx?: string; filename?: string; error?: string }> {
  const ctx = await authRestaurant(restaurantId);
  if (!ctx) return { error: 'No autorizado.' };

  const [report, branding] = await Promise.all([
    getSalesReport(restaurantId, from, to, ctx.tz),
    resolveRestaurantBranding(restaurantId),
  ]);

  const subtitle = `${formatDateRangeLabel(from, to)} · Generado el ${longDate(new Date().toISOString())}`;
  const wb = await createBrandedWorkbook();

  /* — Resumen: KPIs + mezcla de ventas — */
  const ws1 = wb.addWorksheet('Resumen');
  addBrandedHeader(ws1, { branding, title: 'Reporte de ventas', subtitle, columnsSpan: 3 });

  const kpiHeaderRow = ws1.addRow(['Métrica', 'Valor']);
  styleTableHeaderRow(ws1, kpiHeaderRow.number, branding);
  freezeHeaderRow(ws1, kpiHeaderRow.number);

  const moneyRow = (label: string, value: number) => {
    setCurrencyCell(ws1.addRow([label, value]).getCell(2), branding);
  };
  ws1.addRow(['Pedidos', report.orders]);
  moneyRow('Ingreso bruto', report.revenue);
  moneyRow('Ingreso de productos', report.productRevenue);
  moneyRow('Envíos', report.deliveryRevenue);
  moneyRow('Propinas', report.tips);
  moneyRow('Costo', report.cost);
  moneyRow('Utilidad', report.profit);
  if (report.marginPct != null) {
    ws1.addRow(['Margen %', report.marginPct]).getCell(2).numFmt = PERCENT_NUM_FMT;
  } else {
    ws1.addRow(['Margen %', 'n/d']);
  }
  moneyRow('Ticket promedio', report.avgTicket);

  const addSplitSection = (label: string, rows: Split[]) => {
    if (rows.length === 0) return;
    ws1.addRow([]);
    ws1.addRow([label]).getCell(1).font = { bold: true, size: 10.5 };
    writeStyledTable(
      ws1, branding, [label, 'Pedidos', 'Ingreso'],
      rows.map((x) => [x.label, x.orders, x.revenue]),
      { currencyCols: [3] },
    );
  };
  addSplitSection('Canal', report.byChannel);
  addSplitSection('Método de pago', report.byPayment);
  addSplitSection('Zona de entrega', report.byZone);
  autoFitColumns(ws1);

  /* — Ventas por día — */
  const ws2 = wb.addWorksheet('Ventas por día');
  addBrandedHeader(ws2, { branding, title: 'Ventas por día', subtitle, columnsSpan: 3, compact: true });
  const { headerRow: dayHeader } = writeStyledTable(
    ws2, branding, ['Fecha', 'Pedidos', 'Ingreso'],
    report.series.map((d) => [d.label, d.orders, d.revenue]),
    { currencyCols: [3] },
  );
  freezeHeaderRow(ws2, dayHeader);
  autoFitColumns(ws2);

  /* — Más vendidos — */
  const ws3 = wb.addWorksheet('Más vendidos');
  addBrandedHeader(ws3, { branding, title: 'Más vendidos (por ingreso)', subtitle, columnsSpan: 5, compact: true });
  const { headerRow: revHeader } = writeStyledTable(
    ws3, branding, ['Producto', 'Cantidad', 'Ingreso', 'Costo', 'Utilidad'],
    report.topByRevenue.map((p) => [p.name, p.qty, p.revenue, p.cost, p.profit]),
    { currencyCols: [3, 4, 5] },
  );
  freezeHeaderRow(ws3, revHeader);
  autoFitColumns(ws3);

  /* — Más rentables (solo si hay productos con costo capturado) — */
  if (report.topByProfit.length > 0) {
    const ws4 = wb.addWorksheet('Más rentables');
    addBrandedHeader(ws4, { branding, title: 'Más rentables (por utilidad)', subtitle, columnsSpan: 5, compact: true });
    const { headerRow: profitHeader } = writeStyledTable(
      ws4, branding, ['Producto', 'Cantidad', 'Ingreso', 'Costo', 'Utilidad'],
      report.topByProfit.map((p) => [p.name, p.qty, p.revenue, p.cost, p.profit]),
      { currencyCols: [3, 4, 5] },
    );
    freezeHeaderRow(ws4, profitHeader);
    autoFitColumns(ws4);
  }

  const xlsx = await workbookToBase64(wb);
  return { xlsx, filename: `reporte-ventas-${from}_a_${to}.xlsx` };
}

/* ── Export del arqueo de caja — PDF (cliente) + Excel (servidor) ── */

function summarizeByMethod(byMethod: Record<string, number> | null): string {
  if (!byMethod) return '';
  return Object.entries(byMethod)
    .map(([method, amount]) => `${method === 'CASH' ? 'Efectivo' : method}: ${Number(amount).toFixed(2)}`)
    .join(', ');
}

/** Datos ya armados (marca + historial) para dibujar el PDF de arqueo en el cliente. */
export async function getCashHistoryPdfData(
  restaurantId: string,
  limit = 200,
): Promise<{ rows?: CashCount[]; branding?: DocumentBranding; slug?: string; error?: string }> {
  const ctx = await authRestaurant(restaurantId);
  if (!ctx) return { error: 'No autorizado.' };
  const [rows, branding] = await Promise.all([
    getCashHistory(restaurantId, limit),
    resolveRestaurantBranding(restaurantId),
  ]);
  return { rows, branding, slug: ctx.slug };
}

/** Genera el historial de arqueos como .xlsx real, con marca del restaurante. */
export async function exportCashHistoryXlsx(
  restaurantId: string,
  limit = 200,
): Promise<{ xlsx?: string; filename?: string; error?: string }> {
  const ctx = await authRestaurant(restaurantId);
  if (!ctx) return { error: 'No autorizado.' };

  const [rows, branding] = await Promise.all([
    getCashHistory(restaurantId, limit),
    resolveRestaurantBranding(restaurantId),
  ]);

  const subtitle = `${rows.length} corte${rows.length === 1 ? '' : 's'} · Generado el ${longDate(new Date().toISOString())}`;
  const wb = await createBrandedWorkbook();
  const ws = wb.addWorksheet('Arqueo de caja');
  const headers = ['Fecha', 'Turno', 'Cajero', 'Fondo inicial', 'Esperado', 'Contado', 'Diferencia', 'Por método', 'Notas'];
  addBrandedHeader(ws, { branding, title: 'Arqueo de caja', subtitle, columnsSpan: headers.length });

  const { headerRow } = writeStyledTable(
    ws, branding, headers,
    rows.map((c) => [
      c.business_date, c.shift_label ?? '', c.cashier_name ?? '',
      Number(c.opening_float), Number(c.expected_cash), Number(c.counted_cash), Number(c.difference),
      summarizeByMethod(c.by_method), c.notes ?? '',
    ]),
    { currencyCols: [4, 5, 6, 7] },
  );
  freezeHeaderRow(ws, headerRow);
  autoFitColumns(ws, { max: 46 });

  const xlsx = await workbookToBase64(wb);
  return { xlsx, filename: `arqueo-caja-${ctx.slug}-${new Date().toISOString().slice(0, 10)}.xlsx` };
}
