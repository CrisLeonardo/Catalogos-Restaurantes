'use server';

/* ============================================================
   FINANZAS — Corte de caja + export de reportes (Fase A)
   ------------------------------------------------------------
   · getCashSummary:       efectivo esperado HOY (por método de pago).
   · closeCaja:            cierra el turno (efectivo + gastos + propinas).
   · getCashHistory:       últimos cortes del restaurante.
   · deleteCashCount:      elimina un corte si tiene menos de 24 h.
   · exportSalesReportXlsx: reporte de ventas del rango a .xlsx.
   · getSalesReportData:   datos del reporte para PDF en el cliente.
   Todo pasa por service role tras validar el rol del usuario.
   ============================================================ */

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { canActOnGroupBranch } from '@/lib/db/admin';
import { resolveEffectiveRole } from '@/lib/db/membership';
import { can } from '@/lib/permissions';
import { revalidatePath } from 'next/cache';
import { localDateKey } from '@/lib/hours';
import { getSalesReport } from '@/lib/db/reports';
import type { SalesReport, Split } from '@/lib/db/reports';
import { DENOM_FIELDS } from '@/lib/finanzas-constants';
import { faltaLaColumna, faltaLaMigracion } from '@/lib/db/migracion-ausente';
import { resolveRestaurantBranding } from '@/lib/documents/branding';
import {
  createBrandedWorkbook, addBrandedHeader, styleTableHeaderRow, freezeHeaderRow,
  writeStyledTable, autoFitColumns, setCurrencyCell, PERCENT_NUM_FMT, workbookToBase64,
} from '@/lib/documents/excel';
import { formatDateRangeLabel, formatDocMoney, longDate } from '@/lib/documents/format';
import { labelOf } from '@/lib/payment-method';
import { logActivity } from '@/lib/activity';
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

  // Qué es esta persona EN ESTE restaurante. El perfil solo sabe de uno —y
  // desde el modelo de membresías el dueño lo tiene en null— así que
  // preguntárselo a él dejaba fuera al dueño de su propio negocio.
  const efectivo = await resolveEffectiveRole(
    { role: profile?.role ?? null, permissions: (profile?.permissions as string[] | null) ?? null },
    restaurantId,
  );

  const belongs =
    profile?.role === 'SUPER_ADMIN' ||
    efectivo.isMember ||
    (['RESTAURANT_OWNER', 'RESTAURANT_STAFF'].includes(profile?.role ?? '') &&
      profile?.restaurant_id === restaurantId) ||
    (await canActOnGroupBranch(restaurantId));
  if (!belongs) return null;
  if (!can(efectivo.role, efectivo.permissions, 'finanzas')) return null;

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

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Lo cobrado de estos pedidos, por método (migración 129).
 *
 * Devuelve `null` si la tabla todavía no existe en este entorno: el
 * arqueo sigue funcionando con `orders.payment_method`, que es lo que
 * hacía antes. Un informe no puede caerse por una migración pendiente.
 */
async function pagosDelDia(
  db: ReturnType<typeof createServiceClient>,
  restaurantId: string,
  orderIds: string[],
): Promise<{ porPedido: Map<string, Map<string, number>> } | null> {
  const { data, error } = await db
    .from('order_payments')
    .select('order_id, method, amount')
    .eq('restaurant_id', restaurantId)
    .in('order_id', orderIds.slice(0, 1000));

  if (error) return null;

  const porPedido = new Map<string, Map<string, number>>();
  for (const row of data ?? []) {
    const id = row.order_id as string;
    const metodo = ((row.method as string) || 'CASH').toUpperCase();
    const suyo = porPedido.get(id) ?? new Map<string, number>();
    suyo.set(metodo, round2((suyo.get(metodo) ?? 0) + Number(row.amount ?? 0)));
    porPedido.set(id, suyo);
  }
  return { porPedido };
}

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
    .select('id, created_at, payment_method, total')
    .eq('restaurant_id', restaurantId)
    .neq('status', 'CANCEL')
    .gte('created_at', since.toISOString())
    .limit(5000);

  const byMethod: Record<string, number> = {};
  let orders = 0, totalSales = 0;
  /* Los pedidos de hoy, para poder preguntar por SUS pagos sin traerse el
     histórico entero del local. */
  const deHoy: string[] = [];
  for (const o of data ?? []) {
    if (localDateKey(new Date(o.created_at as string), tz) !== todayKey) continue;
    const pm = ((o.payment_method as string) || 'CASH').toUpperCase();
    byMethod[pm] = (byMethod[pm] ?? 0) + Number(o.total);
    totalSales += Number(o.total);
    orders += 1;
    deHoy.push(o.id as string);
  }

  /* EL REPARTO DE VERDAD, cuando lo hay (migración 129, M-11).
     ------------------------------------------------------------
     Arriba se agrupa por `orders.payment_method`, que es UNA palabra por
     pedido: una mesa que pagó Q250 en efectivo y Q150 con tarjeta caía
     entera en un bucket, y la caja salía larga o corta cada noche que
     alguien partiera el pago. Donde hay filas en `order_payments` mandan
     ellas, porque son el dinero que de verdad entró.

     Los pedidos SIN filas —los de antes de la 129, y los canales
     externos— se quedan con su columna: mezclar las dos fuentes por
     pedido y no a medias es lo que hace que el total siga cuadrando. */
  const pagos = deHoy.length > 0 ? await pagosDelDia(db, restaurantId, deHoy) : null;
  if (pagos && pagos.porPedido.size > 0) {
    /* SOLO los de hoy. La consulta trae 24 h para no depender de la zona
       horaria al filtrar en SQL, y el primer bucle ya descartó los de
       ayer: recorrer aquí `data` entero restaría el total de un pedido
       que nunca se sumó, y el bucket saldría en negativo. */
    const hoy = new Set(deHoy);
    for (const o of data ?? []) {
      const id = o.id as string;
      if (!hoy.has(id)) continue;
      const suyos = pagos.porPedido.get(id);
      if (!suyos) continue;
      const pm = ((o.payment_method as string) || 'CASH').toUpperCase();
      byMethod[pm] = round2((byMethod[pm] ?? 0) - Number(o.total));
      if (byMethod[pm] === 0) delete byMethod[pm];
      for (const [metodo, monto] of suyos) {
        byMethod[metodo] = round2((byMethod[metodo] ?? 0) + monto);
      }
    }
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
  const cols = 'id, business_date, opening_float, expected_cash, counted_cash, difference, by_method, denomination_breakdown, shift_label, cashier_name, notes, created_at, created_by';
  const pedir = (soloCerrados: boolean) => {
    const q = ctx.db
      .from('cash_counts')
      .select(cols)
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 200));
    /* El cierre a medias (`status = 'DRAFT'`, migración 123) NO es un corte:
       si se colara aquí, «Cortes recientes» enseñaría como cerrado un turno
       que todavía se está contando —y el export de arqueos lo daría por
       bueno—. Donde la migración no ha corrido no existen borradores, así
       que la consulta de siempre vale tal cual. */
    return soloCerrados ? q.neq('status', 'DRAFT') : q;
  };

  const cerrados = await pedir(true);
  const { error } = cerrados;
  const data = faltaLaColumna(error)
    ? (await pedir(false)).data
    : cerrados.data;
  return (data ?? []) as CashCount[];
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
  revalidatePath('/admin/caja'); // el historial de cortes vive en Caja
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

function summarizeByMethod(byMethod: Record<string, number> | null, branding: DocumentBranding): string {
  if (!byMethod) return '';
  return Object.entries(byMethod)
    .map(([method, amount]) => `${labelOf(method)}: ${formatDocMoney(Number(amount), branding)}`)
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
      summarizeByMethod(c.by_method, branding), c.notes ?? '',
    ]),
    { currencyCols: [4, 5, 6, 7] },
  );
  freezeHeaderRow(ws, headerRow);
  autoFitColumns(ws, { max: 46 });

  const xlsx = await workbookToBase64(wb);
  return { xlsx, filename: `arqueo-caja-${ctx.slug}-${new Date().toISOString().slice(0, 10)}.xlsx` };
}

/* ════════════════════════════════════════════════════════════
   NEGOCIO › CAJA — cerrar el día en tres pasos
   ------------------------------------------------------------
   El arqueo vivía al final del scroll de Finanzas, como un formulario
   largo de once casillas con el cuadre hasta abajo. Cerrar caja es
   tarea de TODAS LAS NOCHES, no un apéndice de un reporte.

   Aquí vive lo que necesita su propia pestaña:

     1. Efectivo — contar, con el cuadre recalculándose a cada tecla.
     2. Gastos   — lo que salió de la caja durante el turno. Sin esto
                   el arqueo nunca cuadraba: ese dinero ya no estaba
                   en el cajón y nada lo explicaba.
     3. Propinas — cuánto entró y cómo se reparte entre quienes
                   atendieron.

   Y algo que el formulario de antes no permitía: dejarlo a medias.
   `status = 'DRAFT'` guarda el cierre en curso para retomarlo, con un
   índice único que garantiza UN solo borrador por restaurante — dos
   borradores abiertos son dos cuadres que se contradicen.
   ════════════════════════════════════════════════════════════ */

export interface CajaExpense {
  id: string;
  concept: string;
  amount: number;
  paid_by: string | null;
  receipt_url: string | null;
  notes: string | null;
  created_at: string;
}

/** Lo que le toca a cada quien del bote de propinas del turno. */
export interface TipShare {
  /** profile.id de quien atendió; null = el bote común / sin asignar. */
  profileId: string | null;
  name: string;
  /** Mesas distintas que atendió hoy — la referencia para repartir. */
  tables: number;
  amount: number;
}

/** El cierre a medias que se dejó guardado. */
export interface CajaDraft {
  id: string;
  counts: Record<string, number>;
  openingFloat: number;
  shiftLabel: string | null;
  notes: string | null;
  tips: TipShare[] | null;
  savedAt: string;
}

export interface CajaState {
  date: string;
  summary: CashSummary;
  expenses: CajaExpense[];
  expensesTotal: number;
  /** Propinas del día, ya sugeridas por mesero según lo que atendió. */
  tips: TipShare[];
  tipsTotal: number;
  draft: CajaDraft | null;
  /** La migración 123 no ha corrido: la pestaña funciona, sin gastos. */
  needsMigration: boolean;
}

const EMPTY_CAJA = (date: string): CajaState => ({
  date,
  summary: EMPTY_SUMMARY(date),
  expenses: [],
  expensesTotal: 0,
  tips: [],
  tipsTotal: 0,
  draft: null,
  needsMigration: false,
});

/** Una columna que la migración 123 todavía no creó en este entorno. */
function faltaMigracion(error: { code?: string } | null): boolean {
  return faltaLaMigracion(error);
}

/**
 * Todo lo que la pestaña Caja necesita para pintarse, en un viaje.
 *
 * Degrada sin romperse: si la migración 123 no ha corrido, los gastos y
 * el borrador simplemente no existen y el paso 1 sigue funcionando
 * exactamente como el arqueo de siempre.
 */
export async function getCajaState(restaurantId: string): Promise<CajaState> {
  const hoyGuess = new Date().toISOString().slice(0, 10);
  const ctx = await authRestaurant(restaurantId);
  if (!ctx) return EMPTY_CAJA(hoyGuess);

  const { db, tz } = ctx;
  const summary = await getCashSummary(restaurantId);
  let needsMigration = false;

  /* ── Gastos del día, todavía sin atar a ningún corte ── */
  let expenses: CajaExpense[] = [];
  {
    const { data, error } = await db
      .from('cash_expenses')
      .select('id, concept, amount, paid_by, receipt_url, notes, created_at')
      .eq('restaurant_id', restaurantId)
      .eq('business_date', summary.date)
      .is('cash_count_id', null)
      .order('created_at', { ascending: true });
    if (error) needsMigration = needsMigration || faltaMigracion(error);
    else expenses = (data ?? []).map((r) => ({ ...r, amount: Number(r.amount) })) as CajaExpense[];
  }

  /* ── El cierre que quedó a medias ── */
  let draft: CajaDraft | null = null;
  {
    const { data, error } = await db
      .from('cash_counts')
      .select('id, denomination_breakdown, opening_float, shift_label, notes, tips_distribution, created_at')
      .eq('restaurant_id', restaurantId)
      .eq('status', 'DRAFT')
      .maybeSingle();
    if (error) needsMigration = needsMigration || faltaMigracion(error);
    else if (data) {
      draft = {
        id: data.id as string,
        counts: (data.denomination_breakdown as Record<string, number> | null) ?? {},
        openingFloat: Number(data.opening_float ?? 0),
        shiftLabel: (data.shift_label as string | null) ?? null,
        notes: (data.notes as string | null) ?? null,
        tips: (data.tips_distribution as TipShare[] | null) ?? null,
        savedAt: data.created_at as string,
      };
    }
  }

  /* ── Propinas del turno, por quien atendió ──────────────────
     El reparto SUGERIDO es proporcional a lo que cada quien atendió;
     el paso 3 deja cambiarlo a mano o partirlo por partes iguales.  */
  const desde = new Date();
  desde.setUTCDate(desde.getUTCDate() - 1);
  const { data: conPropina } = await db
    .from('orders')
    .select('created_at, tip, address, waiter_id, waiter:profiles!orders_waiter_id_fkey(full_name)')
    .eq('restaurant_id', restaurantId)
    .neq('status', 'CANCEL')
    .gt('tip', 0)
    .gte('created_at', desde.toISOString())
    .limit(3000);

  const porMesero = new Map<string, { name: string; tables: Set<string>; amount: number }>();
  let tipsTotal = 0;
  for (const row of (conPropina ?? []) as unknown as {
    created_at: string; tip: number | string; address: string | null;
    waiter_id: string | null; waiter?: { full_name: string | null } | null;
  }[]) {
    if (localDateKey(new Date(row.created_at), tz) !== summary.date) continue;
    const monto = Number(row.tip) || 0;
    if (monto <= 0) continue;
    tipsTotal += monto;
    const key = row.waiter_id ?? '__casa__';
    const prev = porMesero.get(key) ?? {
      name: row.waiter?.full_name ?? (row.waiter_id ? 'Mesero' : 'Sin mesero (pedidos en línea)'),
      tables: new Set<string>(),
      amount: 0,
    };
    prev.amount += monto;
    if (row.address) prev.tables.add(row.address);
    porMesero.set(key, prev);
  }

  const tips: TipShare[] = [...porMesero.entries()]
    .map(([key, v]) => ({
      profileId: key === '__casa__' ? null : key,
      name: v.name,
      tables: v.tables.size,
      amount: Math.round(v.amount * 100) / 100,
    }))
    .sort((a, b) => b.amount - a.amount);

  return {
    date: summary.date,
    summary,
    expenses,
    expensesTotal: Math.round(expenses.reduce((s, e) => s + e.amount, 0) * 100) / 100,
    tips,
    tipsTotal: Math.round(tipsTotal * 100) / 100,
    draft,
    needsMigration,
  };
}

/** Anota un gasto pagado con dinero de la caja. */
export async function addCashExpense(input: {
  restaurantId: string;
  concept: string;
  amount: number;
  paidBy?: string | null;
  notes?: string | null;
}): Promise<{ ok?: true; error?: string }> {
  const ctx = await authRestaurant(input.restaurantId);
  if (!ctx) return { error: 'No autorizado.' };

  const concept = (input.concept ?? '').trim();
  if (!concept) return { error: 'Escribe en qué se gastó.' };
  if (concept.length > 120) return { error: 'El concepto es demasiado largo.' };
  const amount = Math.round((Number(input.amount) || 0) * 100) / 100;
  if (!(amount > 0)) return { error: 'El monto tiene que ser mayor que cero.' };
  if (amount > 1_000_000) return { error: 'Ese monto no parece un gasto de caja.' };

  const summary = await getCashSummary(input.restaurantId);
  const { error } = await ctx.db.from('cash_expenses').insert({
    restaurant_id: input.restaurantId,
    business_date: summary.date,
    concept,
    amount,
    paid_by: (input.paidBy ?? '').trim() || ctx.cashierName,
    notes: (input.notes ?? '').trim() || null,
    created_by: ctx.userId,
  });

  if (error) {
    if (faltaMigracion(error)) return { error: 'Falta la migración 123 para poder anotar gastos de caja.' };
    return { error: error.message };
  }

  // El dinero que sale del cajón, con quién lo sacó (PROD-10).
  await logActivity({
    restaurantId: input.restaurantId, actorId: ctx.userId,
    action: 'gasto', entity: concept, meta: { evento: 'alta', monto: amount },
  });

  revalidatePath('/admin/caja');
  revalidatePath('/admin/finanzas');
  return { ok: true };
}

/** Borra un gasto que todavía no se cerró con ningún corte. */
export async function deleteCashExpense(
  restaurantId: string,
  id: string,
): Promise<{ ok?: true; error?: string }> {
  if (!UUID_RE.test(id)) return { error: 'Gasto no encontrado.' };
  const ctx = await authRestaurant(restaurantId);
  if (!ctx) return { error: 'No autorizado.' };

  // Un gasto ya atado a un corte cerrado no se toca: cambiaría un cuadre
  // que alguien ya firmó.
  const { data: borrados, error } = await ctx.db
    .from('cash_expenses')
    .delete()
    .eq('id', id)
    .eq('restaurant_id', restaurantId)
    .is('cash_count_id', null)
    .select('concept, amount');

  if (error) return { error: error.message };

  const borrado = borrados?.[0];
  if (borrado) {
    await logActivity({
      restaurantId, actorId: ctx.userId,
      action: 'gasto', entity: borrado.concept as string, meta: { evento: 'borrado', monto: Number(borrado.amount) },
    });
  }

  revalidatePath('/admin/caja');
  return { ok: true };
}

/** Lo que el cliente manda para guardar o cerrar el turno. */
export interface CajaPayload {
  restaurantId: string;
  /** Denominación → cuántos hay. */
  counts: Record<string, number>;
  openingFloat: number;
  shiftLabel?: string | null;
  notes?: string | null;
  /** Reparto de propinas (paso 3). null = todavía no se repartió. */
  tips?: TipShare[] | null;
}

/** Lee el payload y calcula el cuadre desde el SERVIDOR, nunca del cliente. */
async function cuadre(ctx: NonNullable<Awaited<ReturnType<typeof authRestaurant>>>, input: CajaPayload) {
  const breakdown: Record<string, number> = {};
  let centavos = 0;
  for (const { field, centavos: c } of DENOM_FIELDS) {
    const n = Math.max(0, Math.floor(Number(input.counts?.[field]) || 0));
    breakdown[field] = n;
    centavos += n * c;
  }
  const counted = Math.round(centavos) / 100;
  const opening = Math.max(0, Math.round((Number(input.openingFloat) || 0) * 100) / 100);

  const summary = await getCashSummary(input.restaurantId);

  const { data: gastos } = await ctx.db
    .from('cash_expenses')
    .select('amount')
    .eq('restaurant_id', input.restaurantId)
    .eq('business_date', summary.date)
    .is('cash_count_id', null);
  const expensesTotal = Math.round(
    ((gastos ?? []) as { amount: number | string }[]).reduce((s, g) => s + Number(g.amount), 0) * 100,
  ) / 100;

  /* En el cajón tiene que haber: lo que se abrió + lo que entró en
     efectivo − lo que salió pagando cosas. Sin restar los gastos, un
     arqueo honesto salía siempre «faltando» justo lo del mercado. */
  const esperadoEnCaja = Math.round((opening + summary.expectedCash - expensesTotal) * 100) / 100;
  const difference = Math.round((counted - esperadoEnCaja) * 100) / 100;

  return { breakdown, counted, opening, summary, expensesTotal, esperadoEnCaja, difference };
}

/**
 * «Guardar y seguir después». El cierre puede dejarse a medias: es de
 * noche, entra un cliente, y el conteo no se puede perder por eso.
 */
export async function saveCajaDraft(input: CajaPayload): Promise<{ ok?: true; error?: string }> {
  const ctx = await authRestaurant(input.restaurantId);
  if (!ctx) return { error: 'No autorizado.' };

  const c = await cuadre(ctx, input);

  const fila = {
    restaurant_id:          input.restaurantId,
    business_date:          c.summary.date,
    status:                 'DRAFT',
    opening_float:          c.opening,
    expected_cash:          c.summary.expectedCash,
    counted_cash:           c.counted,
    difference:             c.difference,
    expenses_total:         c.expensesTotal,
    by_method:              c.summary.byMethod,
    denomination_breakdown: c.breakdown,
    shift_label:            (input.shiftLabel ?? '').trim() || null,
    cashier_name:           ctx.cashierName,
    notes:                  (input.notes ?? '').trim() || null,
    tips_distribution:      input.tips ?? null,
    tips_total:             (input.tips ?? []).reduce((s, t) => s + (Number(t.amount) || 0), 0),
    created_by:             ctx.userId,
  };

  const { data: existente } = await ctx.db
    .from('cash_counts')
    .select('id')
    .eq('restaurant_id', input.restaurantId)
    .eq('status', 'DRAFT')
    .maybeSingle();

  const { error } = existente
    ? await ctx.db.from('cash_counts').update(fila).eq('id', existente.id as string)
    : await ctx.db.from('cash_counts').insert(fila);

  if (error) {
    if (faltaMigracion(error)) return { error: 'Falta la migración 123 para poder guardar el cierre a medias.' };
    return { error: error.message };
  }

  revalidatePath('/admin/caja');
  return { ok: true };
}

/** Descarta el cierre a medias y empieza de cero. */
export async function discardCajaDraft(restaurantId: string): Promise<{ ok?: true; error?: string }> {
  const ctx = await authRestaurant(restaurantId);
  if (!ctx) return { error: 'No autorizado.' };
  const { error } = await ctx.db
    .from('cash_counts')
    .delete()
    .eq('restaurant_id', restaurantId)
    .eq('status', 'DRAFT');
  if (error) return { error: error.message };
  revalidatePath('/admin/caja');
  return { ok: true };
}

/** El resultado del cierre, para la pantalla final e imprimir. */
export interface CajaCloseResult {
  id: string;
  date: string;
  counted: number;
  expected: number;
  opening: number;
  expensesTotal: number;
  tipsTotal: number;
  difference: number;
}

/**
 * Cierra el turno: escribe el corte definitivo, ata los gastos del día a
 * ese corte y borra el borrador.
 *
 * Los gastos se atan (`cash_count_id`) en vez de copiarse: así el corte
 * de mañana no vuelve a contar lo del mercado de hoy, y el detalle sigue
 * disponible por si alguien pregunta qué fueron esos Q412.
 */
export async function closeCaja(input: CajaPayload): Promise<{ result?: CajaCloseResult; error?: string }> {
  const ctx = await authRestaurant(input.restaurantId);
  if (!ctx) return { error: 'No autorizado.' };

  const c = await cuadre(ctx, input);
  if (c.counted <= 0) return { error: 'Cuenta el efectivo antes de cerrar el turno.' };

  const tips = input.tips ?? null;
  const tipsTotal = Math.round((tips ?? []).reduce((s, t) => s + (Number(t.amount) || 0), 0) * 100) / 100;

  const fila: Record<string, unknown> = {
    restaurant_id:          input.restaurantId,
    business_date:          c.summary.date,
    opening_float:          c.opening,
    expected_cash:          c.summary.expectedCash,
    counted_cash:           c.counted,
    difference:             c.difference,
    by_method:              c.summary.byMethod,
    denomination_breakdown: c.breakdown,
    shift_label:            (input.shiftLabel ?? '').trim() || null,
    cashier_name:           ctx.cashierName,
    notes:                  (input.notes ?? '').trim() || null,
    created_by:             ctx.userId,
    status:                 'CLOSED',
    expenses_total:         c.expensesTotal,
    tips_total:             tipsTotal,
    tips_distribution:      tips,
  };

  let insert = await ctx.db.from('cash_counts').insert(fila).select('id').single();
  if (insert.error && faltaMigracion(insert.error)) {
    // Sin la migración 123 el corte se guarda igual, con las columnas de
    // siempre: cerrar caja nunca debe quedar bloqueado por una mejora.
    for (const k of ['status', 'expenses_total', 'tips_total', 'tips_distribution']) delete fila[k];
    insert = await ctx.db.from('cash_counts').insert(fila).select('id').single();
  }
  if (insert.error || !insert.data) return { error: insert.error?.message ?? 'No se pudo cerrar la caja.' };

  const id = insert.data.id as string;

  await ctx.db
    .from('cash_expenses')
    .update({ cash_count_id: id })
    .eq('restaurant_id', input.restaurantId)
    .eq('business_date', c.summary.date)
    .is('cash_count_id', null);

  await ctx.db
    .from('cash_counts')
    .delete()
    .eq('restaurant_id', input.restaurantId)
    .eq('status', 'DRAFT');

  revalidatePath('/admin/caja');
  revalidatePath('/admin/finanzas');

  return {
    result: {
      id,
      date: c.summary.date,
      counted: c.counted,
      expected: c.summary.expectedCash,
      opening: c.opening,
      expensesTotal: c.expensesTotal,
      tipsTotal,
      difference: c.difference,
    },
  };
}
