'use server';

/* ============================================================
   FINANZAS — Turnos de caja + export de reportes
   ------------------------------------------------------------
   · getCashSummary:       lo cobrado en el turno abierto, por método.
   · getCajaState:         todo lo que la pantalla de Caja necesita.
   · abrirTurno / closeCaja: abrir y cerrar el turno (migración 145).
   · getCashHistory:       últimos cortes del restaurante.
   · anularCorte:          anula el último corte con motivo y firma.
   · exportSalesReportXlsx: reporte de ventas del rango a .xlsx.
   · getSalesReportData:   datos del reporte para PDF en el cliente.
   Todo pasa por service role tras validar el rol del usuario.
   ============================================================ */

import { revalidatePath } from 'next/cache';
import { getSalesReport } from '@/lib/db/reports';
import type { SalesReport, Split } from '@/lib/db/reports';
import { DENOM_FIELDS } from '@/lib/finanzas-constants';
import { faltaLaMigracion, faltaLaFuncion } from '@/lib/db/migracion-ausente';
import { resolveRestaurantBranding } from '@/lib/documents/branding';
import {
  createBrandedWorkbook, addBrandedHeader, styleTableHeaderRow, freezeHeaderRow,
  writeStyledTable, autoFitColumns, setCurrencyCell, PERCENT_NUM_FMT, workbookToBase64,
} from '@/lib/documents/excel';
import { formatDateRangeLabel, formatDocMoney, longDate } from '@/lib/documents/format';
import { labelOf } from '@/lib/payment-method';
import { logActivity } from '@/lib/activity';
import type { DocumentBranding } from '@/lib/documents/types';
import { esperadoEnCajon, type CuadreDelPeriodo } from '@/lib/caja/libro';
import {
  leerTurno, hayPendientes,
  type CobroDelTurno, type Pendientes, type LecturaDelTurno,
} from '@/lib/caja/turno-servidor';
import type { Aprobador } from '@/lib/void-approval';
import { listarAprobadores } from '@/lib/auth/firma-encargado';
import { authRestaurant, firmar, type CajaCtx as Ctx, type FirmaInput } from '@/lib/caja/acceso';
import { getTuDia } from '@/lib/db/momentos';
import type { RecordDelDia } from '@/lib/momentos';
import { sendPushToRestaurant } from '@/lib/push';
import { fmtMoney } from '@/lib/money';
import { identidadCobroValida } from '@/lib/cobro-intento';

const UUID_RE = /^[0-9a-f-]{36}$/i;

/* Quién puede tocar la caja de ESTE restaurante: `lib/caja/acceso.ts`
   (lo comparten las correcciones de cobro, y aquí todo lo exportado sería
   una acción). */

const lectura = (ctx: Ctx, restaurantId: string) =>
  leerTurno(ctx.db, { restaurantId, timezone: ctx.tz, corteMin: ctx.corte });

export interface CashSummary {
  /** Día de negocio del turno (con la hora de corte del local). */
  date: string;
  /** Efectivo NETO cobrado en el turno: lo que tiene que haber entrado al cajón. */
  expectedCash: number;
  byMethod: Record<string, number>;
  orders: number;
  /** Todo lo cobrado en el turno, cualquier método (sin devoluciones). */
  totalSales: number;
}

const EMPTY_SUMMARY = (date: string): CashSummary => ({
  date, expectedCash: 0, byMethod: {}, orders: 0, totalSales: 0,
});

const round2 = (n: number) => Math.round(n * 100) / 100;

function resumen(l: LecturaDelTurno): CashSummary {
  return {
    date: l.dia,
    expectedCash: l.cuadre.efectivo,
    byMethod: l.cuadre.porMetodo,
    orders: l.cuadre.pedidos,
    totalSales: l.cuadre.cobrado,
  };
}

/**
 * Lo COBRADO en el turno abierto (FUN-01, PROD-02, PROD-03).
 *
 * Ya no es «lo vendido hoy»: es el dinero que entró desde el cierre
 * anterior —nunca antes del inicio del día de negocio—, sacado del libro de
 * cobros (`lib/caja/libro.ts`). Una mesa todavía comiendo no está aquí.
 */
export async function getCashSummary(restaurantId: string): Promise<CashSummary> {
  const ctx = await authRestaurant(restaurantId);
  if (!ctx) return EMPTY_SUMMARY(new Date().toISOString().slice(0, 10));
  return resumen(await lectura(ctx, restaurantId));
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
  /** Desde la 145. */
  status?: 'CLOSED' | 'VOID' | string;
  expenses_total?: number | null;
  opened_at?: string | null;
  opened_by_name?: string | null;
  period_start?: string | null;
  closed_at?: string | null;
  void_reason?: string | null;
  voided_at?: string | null;
};

export async function getCashHistory(
  restaurantId: string,
  limit = 30,
): Promise<CashCount[]> {
  const ctx = await authRestaurant(restaurantId);
  if (!ctx) return [];
  const base = 'id, business_date, opening_float, expected_cash, counted_cash, difference, by_method, denomination_breakdown, shift_label, cashier_name, notes, created_at, created_by';
  const nuevas = ', status, expenses_total, opened_at, opened_by_name, period_start, closed_at, void_reason, voided_at';
  const tope = Math.min(Math.max(limit, 1), 200);

  /* Un turno abierto NO es un corte: si se colara aquí, «Cortes recientes»
     enseñaría como cerrado un turno que todavía se está contando —y el
     export de arqueos lo daría por bueno—. Los anulados sí salen: es lo que
     hace visible un «cerré con faltante, lo anulé y cerré cuadrado». */
  const nuevo = await ctx.db
    .from('cash_counts')
    .select(base + nuevas)
    .eq('restaurant_id', restaurantId)
    .in('status', ['CLOSED', 'VOID'])
    .order('created_at', { ascending: false })
    .limit(tope);
  if (!nuevo.error) return (nuevo.data ?? []) as unknown as CashCount[];

  // Sin la 145 (o sin la 123): la consulta de siempre.
  const viejo = await ctx.db
    .from('cash_counts')
    .select(base)
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })
    .limit(tope);
  return (viejo.data ?? []) as unknown as CashCount[];
}

/* ── Anular un corte (PROD-06) ──────────────────────────────────
   Un corte ya no se borra. `deleteCashCount` lo hacía de verdad, a
   cualquiera con acceso a Caja, sin motivo ni firma ni bitácora: un cajero
   cerraba con faltante, lo borraba y volvía a cerrar «cuadrado». Ahora:

     · solo el ÚLTIMO corte, de las últimas 24 h, y si después no se abrió
       otro turno (el dinero de ese cajón ya habría cambiado de manos);
     · con motivo y la firma de un encargado (el PIN de las anulaciones);
     · el corte queda en el historial como anulado, con quién y por qué, y
       el turno vuelve a abrirse con el mismo fondo para contarlo de nuevo.
   ──────────────────────────────────────────────────────────────── */

/** Quién puede firmar una corrección de caja desde esta sesión. */
export async function getCajaApproval(restaurantId: string): Promise<{ selfApproves: boolean; approvers: Aprobador[] }> {
  const ctx = await authRestaurant(restaurantId);
  if (!ctx) return { selfApproves: false, approvers: [] };
  if (ctx.firmaSola) return { selfApproves: true, approvers: [] };
  return { selfApproves: false, approvers: await listarAprobadores(ctx.db, restaurantId) };
}

export async function anularCorte(input: FirmaInput & {
  restaurantId: string;
  id: string;
  reason: string;
}): Promise<{ ok?: true; error?: string }> {
  const { restaurantId, id } = input;
  if (!UUID_RE.test(id) || !UUID_RE.test(restaurantId)) return { error: 'Parámetros inválidos.' };
  const motivo = (input.reason ?? '').trim();
  if (motivo.length < 3) return { error: 'Escribe por qué se anula el corte.' };
  if (motivo.length > 200) return { error: 'El motivo es demasiado largo.' };

  const ctx = await authRestaurant(restaurantId);
  if (!ctx) return { error: 'No autorizado.' };

  const { data: corte, error: errCorte } = await ctx.db
    .from('cash_counts')
    .select('id, status, created_at, closed_at, opened_at, opened_by, opened_by_name, opening_float, shift_label, counted_cash, difference')
    .eq('id', id)
    .eq('restaurant_id', restaurantId)
    .maybeSingle();
  if (errCorte && faltaLaMigracion(errCorte)) return { error: 'Falta la migración 145 para poder anular cortes.' };
  if (!corte || corte.status !== 'CLOSED') return { error: 'Ese corte no existe o ya está anulado.' };

  const cerradoEn = new Date((corte.closed_at as string | null) ?? (corte.created_at as string));
  if (Date.now() - cerradoEn.getTime() > 24 * 60 * 60 * 1000) {
    return { error: 'Solo se puede anular un corte de las últimas 24 horas.' };
  }

  const l = await lectura(ctx, restaurantId);
  if (l.ultimoCierre?.id !== id) return { error: 'Solo se puede anular el último corte.' };
  if (l.abierto) {
    return { error: 'Ya se abrió otro turno después de este corte. Ciérralo o descártalo antes de anular.' };
  }

  const firma = await firmar(ctx, restaurantId, input);
  if ('error' in firma) return firma;

  const { data: anulado, error } = await ctx.db
    .from('cash_counts')
    .update({
      status: 'VOID',
      void_reason: motivo,
      voided_at: new Date().toISOString(),
      voided_by: ctx.userId,
      void_approved_by: firma.id,
    })
    .eq('id', id)
    .eq('status', 'CLOSED')
    .select('id');
  if (error) return { error: error.message };
  if (!anulado || anulado.length === 0) return { error: 'Ese corte ya se había anulado.' };

  // Los gastos vuelven al turno: siguen habiendo salido del cajón.
  await ctx.db.from('cash_expenses').update({ cash_count_id: null }).eq('cash_count_id', id);

  // Y el turno se reabre con su mismo fondo, para contarlo de nuevo.
  await ctx.db.from('cash_counts').insert({
    restaurant_id: restaurantId,
    business_date: l.dia,
    status: 'OPEN',
    opened_at: corte.opened_at ?? null,
    opened_by: corte.opened_by ?? null,
    opened_by_name: corte.opened_by_name ?? null,
    opening_float: Number(corte.opening_float ?? 0),
    shift_label: corte.shift_label ?? null,
    created_by: ctx.userId,
  });

  await logActivity({
    restaurantId,
    actorId: ctx.userId,
    action: 'corte_anulado',
    entity: motivo,
    meta: {
      corteId: id,
      contado: Number(corte.counted_cash ?? 0),
      diferencia: Number(corte.difference ?? 0),
      firmante: firma.id,
      firmadoPorOtro: firma.id !== ctx.userId,
    },
  });

  revalidatePath('/admin/finanzas');
  revalidatePath('/admin/caja');
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
    getSalesReport(restaurantId, from, to, ctx.tz, ctx.corte),
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
    getSalesReport(restaurantId, from, to, ctx.tz, ctx.corte),
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
  if (report.refunds > 0) moneyRow('Devoluciones (dinero devuelto)', -report.refunds);
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
   NEGOCIO › CAJA — el turno, de la apertura al cierre
   ------------------------------------------------------------
   Desde la migración 145 el cierre es el de un TURNO, no el del día:

     0. Abrir — quién y con cuánto fondo. Opcional: se puede cerrar sin
                haber abierto, como antes, y el fondo se escribe al cerrar.
     1. Efectivo — contar, con el cuadre recalculándose a cada tecla.
     2. Gastos   — lo que salió de la caja durante el turno.
     3. Propinas — las de lo cobrado en el turno, por quien atendió.

   El cuadre cubre lo COBRADO desde el cierre anterior (`lib/caja/libro.ts`),
   así que dos turnos el mismo día cuadran cada uno lo suyo, y el día es
   la suma de sus turnos.

   «Guardar y seguir después» guarda el conteo en el mismo turno abierto:
   el índice único de la 145 garantiza UN turno abierto por restaurante.
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
  /** Mesas distintas que atendió en el turno — la referencia para repartir. */
  tables: number;
  amount: number;
}

/** El cierre a medias que se dejó guardado en el turno abierto. */
export interface CajaDraft {
  id: string;
  counts: Record<string, number>;
  openingFloat: number;
  shiftLabel: string | null;
  notes: string | null;
  tips: TipShare[] | null;
  savedAt: string;
}

export interface BorradorCaja extends ConteoCaja {
  revision: string;
  savedAt: string;
  actorName: string | null;
}

/** El turno abierto, tal como lo enseña la pantalla. */
export interface CajaShift {
  id: string;
  /** null = el turno nació al guardar un conteo, sin abrirlo antes. */
  openedAt: string | null;
  openedByName: string | null;
  openingFloat: number;
  shiftLabel: string | null;
}

export interface CajaState {
  date: string;
  /** Desde cuándo cuenta el cuadre (ISO). */
  periodStart: string;
  /** El último cierre, para decir «desde el cierre de Ana a las 15:00». */
  lastClose: { at: string; cashierName: string | null; shiftLabel: string | null } | null;
  shift: CajaShift | null;
  summary: CashSummary;
  /** Devoluciones y mesas liberadas sin cobrar del turno. */
  refunds: number;
  /** De las devoluciones, las que salieron del cajón en efectivo. */
  refundsCash: number;
  releasedUnpaid: CuadreDelPeriodo['liberadasSinCobrar'];
  payments: CobroDelTurno[];
  pending: Pendientes;
  expenses: CajaExpense[];
  expensesTotal: number;
  /** Propinas del turno, ya sugeridas por mesero según lo que atendió. */
  tips: TipShare[];
  tipsTotal: number;
  draft: CajaDraft | null;
  cloudDraft?: BorradorCaja | null;
  draftUnavailable?: boolean;
  /** Hora de corte del día (minutos), para enseñarla. */
  dayCutoff: number;
  /** Quien mira puede firmar sola las correcciones. */
  selfApproves: boolean;
  /** La migración 145 no ha corrido: sin turnos ni correcciones. */
  needsMigration: boolean;
}

const EMPTY_CAJA = (date: string): CajaState => ({
  date,
  periodStart: new Date().toISOString(),
  lastClose: null,
  shift: null,
  summary: EMPTY_SUMMARY(date),
  refunds: 0,
  refundsCash: 0,
  releasedUnpaid: { pedidos: 0, total: 0 },
  payments: [],
  pending: { mesas: [], domicilios: [], paraLlevar: [], total: 0 },
  expenses: [],
  expensesTotal: 0,
  tips: [],
  tipsTotal: 0,
  draft: null,
  dayCutoff: 0,
  selfApproves: false,
  needsMigration: false,
});

function estadoDeCaja(ctx: Ctx, l: LecturaDelTurno): CajaState {
  const t = l.abierto;
  return {
    date: l.dia,
    periodStart: l.desde,
    lastClose: l.ultimoCierre
      ? { at: l.ultimoCierre.closedAt, cashierName: l.ultimoCierre.cashierName, shiftLabel: l.ultimoCierre.shiftLabel }
      : null,
    shift: t ? { id: t.id, openedAt: t.openedAt, openedByName: t.openedByName, openingFloat: t.openingFloat, shiftLabel: t.shiftLabel } : null,
    summary: resumen(l),
    refunds: l.cuadre.devoluciones,
    refundsCash: l.cuadre.devolucionesEfectivo,
    releasedUnpaid: l.cuadre.liberadasSinCobrar,
    payments: l.cobros,
    pending: l.pendientes,
    expenses: l.gastos,
    expensesTotal: l.gastosTotal,
    tips: l.propinas,
    tipsTotal: l.propinasTotal,
    draft: t?.draft
      ? {
          id: t.id,
          counts: t.draft.counts,
          openingFloat: t.openingFloat,
          shiftLabel: t.shiftLabel,
          notes: t.draft.notes,
          tips: (t.draft.tips as TipShare[] | null) ?? null,
          savedAt: t.draft.savedAt,
        }
      : null,
    dayCutoff: ctx.corte,
    selfApproves: ctx.firmaSola,
    needsMigration: l.sinMigracion,
  };
}

/** Todo lo que la pestaña Caja necesita para pintarse, en un viaje. */
export async function getCajaState(restaurantId: string): Promise<CajaState> {
  const ctx = await authRestaurant(restaurantId);
  if (!ctx) return EMPTY_CAJA(new Date().toISOString().slice(0, 10));
  const turno = await lectura(ctx, restaurantId);
  const { data, error } = await leerBorradorCaja(ctx, restaurantId, turno.desde);
  return {
    ...estadoDeCaja(ctx, turno),
    cloudDraft: data ? {
      ...data.payload as ConteoCaja, revision: data.revision as string,
      savedAt: data.saved_at as string, actorName: data.actor_name as string | null,
    } : null,
    draftUnavailable: !!error,
  };
}

const SIN_145 = 'Falta la migración 145 en esta base para poder abrir y cerrar turnos.';

/** Abre el turno: quién, a qué hora y con cuánto fondo (FUN-01). */
export async function abrirTurno(input: {
  restaurantId: string;
  openingFloat: number;
  shiftLabel?: string | null;
}): Promise<{ ok?: true; error?: string }> {
  const ctx = await authRestaurant(input.restaurantId);
  if (!ctx) return { error: 'No autorizado.' };

  const fondo = Math.round((Number(input.openingFloat) || 0) * 100) / 100;
  if (fondo < 0 || fondo > 1_000_000) return { error: 'Ese fondo no parece válido.' };

  const l = await lectura(ctx, input.restaurantId);
  if (l.sinMigracion) return { error: SIN_145 };

  const ahora = new Date().toISOString();
  const etiqueta = (input.shiftLabel ?? '').trim().slice(0, 40) || null;

  /* Si ya hay un turno —por ejemplo uno que nació al guardar un conteo sin
     abrir—, abrirlo es ponerle quién y fondo, no crear otro. */
  if (l.abierto) {
    if (l.abierto.openedAt) return { error: 'Ya hay un turno abierto.' };
    const { data, error } = await ctx.db.from('cash_counts').update({
      opened_at: ahora, opened_by: ctx.userId, opened_by_name: ctx.cashierName,
      opening_float: fondo, shift_label: etiqueta ?? l.abierto.shiftLabel,
    }).eq('id', l.abierto.id).eq('restaurant_id', input.restaurantId).in('status', ['OPEN', 'DRAFT']).is('opened_at', null).select('id');
    if (error) return { error: error.message };
    if (!data?.length) return { error: 'Este turno ya se cerró o se abrió desde otro aparato.' };
  } else {
    const { error } = await ctx.db.from('cash_counts').insert({
      restaurant_id: input.restaurantId,
      business_date: l.dia,
      status: 'OPEN',
      opened_at: ahora,
      opened_by: ctx.userId,
      opened_by_name: ctx.cashierName,
      opening_float: fondo,
      shift_label: etiqueta,
      created_by: ctx.userId,
    });
    // El índice único: otro aparato lo abrió un segundo antes.
    if (error) return { error: error.code === '23505' ? 'Ya hay un turno abierto.' : error.message };
  }

  await logActivity({
    restaurantId: input.restaurantId,
    actorId: ctx.userId,
    action: 'turno_abierto',
    entity: etiqueta,
    meta: { fondo },
  });

  revalidatePath('/admin/caja');
  return { ok: true };
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

  // El día del gasto es el día de NEGOCIO: el hielo que se compró a la
  // 1:00 es de la noche del viernes, no del sábado.
  const l = await lectura(ctx, input.restaurantId);
  const { error } = await ctx.db.from('cash_expenses').insert({
    restaurant_id: input.restaurantId,
    business_date: l.dia,
    concept,
    amount,
    paid_by: (input.paidBy ?? '').trim() || ctx.cashierName,
    notes: (input.notes ?? '').trim() || null,
    created_by: ctx.userId,
  });

  if (error) {
    if (faltaLaMigracion(error)) return { error: 'Falta la migración 123 para poder anotar gastos de caja.' };
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
  /** Solo cuenta si el turno no se abrió: el abierto ya trae su fondo. */
  openingFloat: number;
  shiftLabel?: string | null;
  notes?: string | null;
  /** Reparto de propinas (paso 3). null = todavía no se repartió. */
  tips?: TipShare[] | null;
}

export interface ConteoCaja extends Omit<CajaPayload, 'restaurantId'> {
  cashCounted: boolean;
  paso: 1 | 2 | 3;
}

export interface AlcanceCaja {
  desde: string;
  id: string | null;
}

const SIN_171 = 'La sincronización de Caja requiere la migración 171.';

function leerBorradorCaja(ctx: Ctx, restaurantId: string, periodo: string) {
  return ctx.db.from('caja_borradores').select('revision,saved_at,actor_name,payload')
    .eq('restaurant_id', restaurantId).eq('period_start', periodo).maybeSingle();
}

export async function guardarBorradorCaja(input: {
  restaurantId: string; turno: AlcanceCaja; revision: string | null; conteo: ConteoCaja;
}): Promise<{ guardado?: { revision: string; savedAt: string }; conflicto?: boolean; error?: string }> {
  const ctx = await authRestaurant(input.restaurantId);
  if (!ctx) return { error: 'No autorizado.' };
  if (input.revision != null && !identidadCobroValida(input.revision)) return { error: 'Revisión inválida.' };
  const l = await lectura(ctx, input.restaurantId);
  if (!l.controlCaja || l.sinMigracion) return { error: SIN_171 };
  if (input.turno.desde !== l.desde || input.turno.id !== (l.abierto?.id ?? null)) {
    return { conflicto: true, error: 'El turno cambió. Revisa el conteo antes de seguir.' };
  }
  const conteo = input.conteo;
  const { breakdown, counted } = conteoCaja(conteo.counts);
  const { data, error } = await ctx.db.rpc('leogin_guardar_borrador_caja', {
    p_restaurant: input.restaurantId, p_periodo: l.desde, p_turno: input.turno.id,
    p_revision: input.revision, p_corte: l.controlCaja.ultimoCierreId,
    p_actor: ctx.userId, p_nombre: ctx.cashierName,
    p_payload: { ...conteo, counts: breakdown, cashCounted: conteo.cashCounted === true || counted > 0 },
  });
  if (error) return { error: faltaLaFuncion(error) ? SIN_171 : error.message, conflicto: /^LGD0[45]$/.test(error.code ?? '') };
  if (!data?.revision) return { error: 'No se confirmó el borrador.' };
  return { guardado: data };
}

function conteoCaja(counts: CajaPayload['counts']) {
  const breakdown: Record<string, number> = {};
  let centavos = 0;
  for (const { field, centavos: c } of DENOM_FIELDS) {
    const n = Math.max(0, Math.floor(Number(counts?.[field]) || 0));
    breakdown[field] = n;
    centavos += n * c;
  }
  return { breakdown, counted: centavos / 100 };
}

/** Lee el payload y calcula el cuadre desde el SERVIDOR, nunca del cliente. */
async function cuadre(ctx: Ctx, input: CajaPayload, conteo = conteoCaja(input.counts)) {
  const { breakdown, counted } = conteo;
  const l = await lectura(ctx, input.restaurantId);
  /* El fondo de un turno abierto es el que se escribió AL ABRIR: dejar que
     el cierre lo cambie sería la forma más fácil de «cuadrar» un faltante. */
  const opening = l.abierto?.openedAt
    ? l.abierto.openingFloat
    : Math.max(0, Math.round((Number(input.openingFloat) || 0) * 100) / 100);

  /* En el cajón tiene que haber: lo que se abrió + el efectivo neto que
     entró en el turno − lo que salió pagando cosas. */
  const esperadoEnCaja = esperadoEnCajon(opening, l.cuadre.efectivo, l.gastosTotal);
  const difference = round2(counted - esperadoEnCaja);

  return { breakdown, counted, opening, l, summary: resumen(l), expensesTotal: l.gastosTotal, esperadoEnCaja, difference };
}

/**
 * «Guardar y seguir después». El cierre puede dejarse a medias: es de
 * noche, entra un cliente, y el conteo no se puede perder por eso. Se
 * guarda en el turno abierto; si no había, nace uno sin apertura.
 */
export async function saveCajaDraft(input: CajaPayload): Promise<{ ok?: true; error?: string }> {
  const ctx = await authRestaurant(input.restaurantId);
  if (!ctx) return { error: 'No autorizado.' };

  const c = await cuadre(ctx, input);
  if (c.l.sinMigracion) return { error: SIN_145 };

  const fila = {
    expected_cash:          c.summary.expectedCash,
    counted_cash:           c.counted,
    difference:             c.difference,
    expenses_total:         c.expensesTotal,
    by_method:              c.summary.byMethod,
    denomination_breakdown: c.breakdown,
    opening_float:          c.opening,
    shift_label:            (input.shiftLabel ?? '').trim() || c.l.abierto?.shiftLabel || null,
    cashier_name:           ctx.cashierName,
    notes:                  (input.notes ?? '').trim() || null,
    tips_distribution:      input.tips ?? null,
    tips_total:             round2((input.tips ?? []).reduce((s, t) => s + (Number(t.amount) || 0), 0)),
    draft_saved_at:         new Date().toISOString(),
  };

  const { data, error } = c.l.abierto
    ? await ctx.db.from('cash_counts').update({ ...fila, status: 'OPEN' }).eq('id', c.l.abierto.id).eq('restaurant_id', input.restaurantId).in('status', ['OPEN', 'DRAFT']).select('id')
    : await ctx.db.from('cash_counts').insert({
        ...fila,
        restaurant_id: input.restaurantId,
        business_date: c.l.dia,
        status: 'OPEN',
        created_by: ctx.userId,
      }).select('id');

  if (error) return { error: error.message };
  if (c.l.abierto && !data?.length) return { error: 'Este turno ya se cerró desde otro aparato.' };

  revalidatePath('/admin/caja');
  return { ok: true };
}

/**
 * Descarta el conteo guardado y empieza de cero. El TURNO no se borra si se
 * abrió de verdad: lo que se descarta es el conteo, no quién abrió ni el
 * fondo. Un turno que solo existía por el conteo guardado sí se va.
 */
export async function discardCajaDraft(restaurantId: string): Promise<{ ok?: true; error?: string }> {
  const ctx = await authRestaurant(restaurantId);
  if (!ctx) return { error: 'No autorizado.' };
  const l = await lectura(ctx, restaurantId);
  if (!l.abierto) return { ok: true };

  const { data, error } = l.abierto.openedAt
    ? await ctx.db.from('cash_counts').update({
        denomination_breakdown: null, counted_cash: 0, difference: 0, notes: null,
        tips_distribution: null, tips_total: 0, draft_saved_at: null,
      }).eq('id', l.abierto.id).eq('restaurant_id', restaurantId).in('status', ['OPEN', 'DRAFT']).select('id')
    : await ctx.db.from('cash_counts').delete().eq('id', l.abierto.id).eq('restaurant_id', restaurantId).in('status', ['OPEN', 'DRAFT']).select('id');
  if (error) return { error: error.message };
  if (!data?.length) return { error: 'Este turno ya se cerró desde otro aparato.' };
  revalidatePath('/admin/caja');
  return { ok: true };
}

/** Los importes y movimientos confirmados en el corte. */
export interface CajaReceipt {
  id: string;
  date: string;
  counted: number;
  cashCounted?: boolean;
  expected: number;
  opening: number;
  expensesTotal: number;
  tipsTotal: number;
  difference: number;
  refunds: number;
  refundsCash: number;
  periodStart: string;
  closedAt: string;
  openedByName: string | null;
  /** Lo que quedó sin cobrar y pasa al turno siguiente. */
  pendingTotal: number;
  expectedDrawer: number;
  byMethod: CashSummary['byMethod'];
  counts: Record<string, number>;
  expenses: { id: string; concept: string; amount: number; at: string }[];
  tips: TipShare[] | null;
  openedAt: string | null;
  shiftLabel: string | null;
  cashierName: string | null;
  notes: string | null;
}

export interface CajaCloseResult extends CajaReceipt {
  /** Cómo va el día del turno (PLAN_MOMENTOS_PICO P5): lo vendido en TODO
   *  el día, no solo en efectivo, y el récord si de verdad lo es. */
  dia: { ventas: number; pedidos: number; record: RecordDelDia | null } | null;
}

export type SolicitudCierre = CajaPayload & { confirmPending?: boolean; cashCounted?: boolean; borradorRevision?: string | null } & (
  | { intentoId: string; turno: AlcanceCaja }
  | { intentoId?: never; turno?: never }
);

type RespuestaCierre = { result?: CajaCloseResult; pending?: Pendientes; error?: string; incierto?: boolean };

const SIN_170 = 'Falta la migración 170 para conservar el recibo del cierre de caja.';

/** Lee un recibo ya confirmado sin volver a calcular el turno. */
export async function getCajaReceipt(restaurantId: string, corteId: string):
  Promise<{ receipt?: CajaReceipt; error?: string }> {
  if (!identidadCobroValida(corteId)) return { error: 'Corte inválido.' };
  const ctx = await authRestaurant(restaurantId);
  if (!ctx) return { error: 'No autorizado.' };
  const { data, error } = await ctx.db.from('caja_recibos').select('recibo')
    .eq('restaurant_id', restaurantId).eq('corte_id', corteId).maybeSingle();
  if (error) return { error: faltaLaMigracion(error) ? SIN_170 : error.message };
  if (!data) return { error: 'Ese corte no tiene un recibo detallado disponible.' };
  return { receipt: data.recibo as CajaReceipt };
}

/**
 * Cierra el turno: escribe el corte definitivo, ata los gastos del periodo
 * a ese corte y fija desde cuándo hasta cuándo contó.
 *
 * Si queda algo sin cobrar (mesas abiertas, domicilios en camino, para
 * llevar sin entregar), la primera llamada NO cierra: devuelve la lista
 * para que la pantalla pregunte. No entra en este cuadre —no se ha
 * cobrado— y contará en el turno en que se cobre (PROD-02).
 */
export async function closeCaja(
  input: SolicitudCierre,
): Promise<RespuestaCierre> {
  const ctx = await authRestaurant(input.restaurantId);
  if (!ctx) return input.intentoId ? { error: 'Vuelve a iniciar sesión para recuperar el cierre.', incierto: true } : { error: 'No autorizado.' };

  const intentoId = input.intentoId ?? crypto.randomUUID();
  if (!identidadCobroValida(intentoId) || (input.intentoId && !input.turno?.desde)) {
    return { error: 'Identidad o turno de cierre inválidos.' };
  }
  const conteo = conteoCaja(input.counts);
  const etiqueta = (input.shiftLabel ?? '').trim() || null;
  const notas = (input.notes ?? '').trim() || null;
  const tips = input.tips ?? null;
  const solicitud = { counts: conteo.breakdown, openingFloat: input.openingFloat,
    shiftLabel: etiqueta, notes: notas, tips, turno: input.turno ?? null, confirmPending: input.confirmPending === true,
    ...(input.cashCounted === undefined ? {} : { cashCounted: input.cashCounted }),
    ...(input.borradorRevision === undefined ? {} : { borradorRevision: input.borradorRevision }) };
  const recuperar = async (): Promise<RespuestaCierre | null> => {
    const { data, error } = await ctx.db.rpc('leogin_recuperar_cierre_caja', {
      p_restaurant: input.restaurantId, p_intento: intentoId, p_actor: ctx.userId, p_solicitud: solicitud,
    });
    if (error) return { error: faltaLaFuncion(error) ? SIN_170 : error.message, incierto: !/^LGD03$/.test(error.code ?? '') };
    return data ? { result: { ...data as CajaReceipt, dia: null } } : null;
  };
  if (input.intentoId) {
    const previo = await recuperar();
    if (previo) return previo;
  }

  let c: Awaited<ReturnType<typeof cuadre>>;
  try { c = await cuadre(ctx, input, conteo); }
  catch (error) { return { error: error instanceof Error ? error.message : 'No se pudo leer la caja.' }; }
  if (!c.l.controlCaja) return { error: 'Falta la migración 166 para cerrar caja con los cobros protegidos.' };
  if (c.l.sinMigracion) return { error: SIN_145 };
  if (input.turno && (input.turno.desde !== c.l.desde || input.turno.id !== (c.l.abierto?.id ?? null))) {
    // Otra petición del mismo intento puede haber confirmado entre las dos lecturas.
    return (await recuperar()) ?? { error: 'El turno cambió. Revisa el cuadre antes de cerrar.' };
  }
  if (input.borradorRevision !== undefined) {
    const { data, error } = await leerBorradorCaja(ctx, input.restaurantId, c.l.desde);
    if (error) return { error: faltaLaMigracion(error) ? SIN_171 : error.message };
    if ((data?.revision ?? null) !== input.borradorRevision) {
      return (await recuperar()) ?? { error: 'Otro aparato guardó un borrador más reciente. Revisa el conteo antes de cerrar.' };
    }
  }
  if (c.counted <= 0 && (input.cashCounted === false || (input.cashCounted === undefined && c.esperadoEnCaja > 0))) {
    return { error: 'Cuenta el efectivo o confirma el conteo en cero antes de cerrar.' };
  }
  if (hayPendientes(c.l.pendientes) && !input.confirmPending) return { pending: c.l.pendientes };

  const tipsTotal = round2((tips ?? []).reduce((s, t) => s + (Number(t.amount) || 0), 0));
  const cerradoEn = c.l.hasta;
  const shiftLabel = etiqueta ?? c.l.abierto?.shiftLabel ?? null;

  const fila: Record<string, unknown> = {
    business_date:          c.l.dia,
    opening_float:          c.opening,
    expected_cash:          c.summary.expectedCash,
    counted_cash:           c.counted,
    difference:             c.difference,
    by_method:              c.summary.byMethod,
    denomination_breakdown: c.breakdown,
    shift_label:            shiftLabel,
    cashier_name:           ctx.cashierName,
    notes:                  notas,
    status:                 'CLOSED',
    expenses_total:         c.expensesTotal,
    tips_total:             tipsTotal,
    tips_distribution:      tips,
    period_start:           c.l.desde,
    closed_at:              cerradoEn,
    draft_saved_at:         null,
  };

  const recibo: Omit<CajaReceipt, 'id'> = {
    date: c.l.dia, counted: c.counted, expected: c.summary.expectedCash, opening: c.opening,
    ...(input.cashCounted === undefined ? {} : { cashCounted: c.counted > 0 || input.cashCounted }),
    expensesTotal: c.expensesTotal, tipsTotal, difference: c.difference,
    refunds: c.l.cuadre.devoluciones, refundsCash: c.l.cuadre.devolucionesEfectivo,
    periodStart: c.l.desde, closedAt: cerradoEn, openedByName: c.l.abierto?.openedByName ?? null,
    pendingTotal: c.l.pendientes.total, expectedDrawer: c.esperadoEnCaja, byMethod: c.summary.byMethod,
    counts: c.breakdown, expenses: c.l.gastos.map((g) => ({ id: g.id, concept: g.concept, amount: g.amount, at: g.created_at })),
    tips, openedAt: c.l.abierto?.openedAt ?? null, shiftLabel, cashierName: ctx.cashierName, notes: notas,
  };
  const { data, error: errCierre } = await ctx.db.rpc('leogin_confirmar_cierre_caja_con_recibo', {
    p_restaurant: input.restaurantId, p_revision: c.l.controlCaja.revision,
    p_ultimo: c.l.controlCaja.ultimoCierreId, p_hasta: cerradoEn,
    p_abierto: c.l.abierto?.id ?? null, p_fila: fila,
    p_gastos: c.l.gastos.map((g) => g.id), p_actor: ctx.userId,
    p_intento: intentoId, p_solicitud: solicitud, p_recibo: recibo,
  });
  if (errCierre) {
    const error = faltaLaFuncion(errCierre) ? SIN_170 : errCierre.message;
    return input.intentoId ? { error, incierto: !/^(LGD0[34]|22023)$/.test(errCierre.code ?? '') } : { error };
  }
  const confirmado = data as { recibo: CajaReceipt; repetido: boolean } | null;
  if (!identidadCobroValida(confirmado?.recibo?.id)) return { error: 'No se pudo confirmar el cierre de caja.' };
  if (confirmado.repetido) return { result: { ...confirmado.recibo, dia: null } };

  await logActivity({
    restaurantId: input.restaurantId,
    actorId: ctx.userId,
    action: 'turno_cerrado',
    entity: shiftLabel,
    meta: {
      corteId: confirmado.recibo.id,
      esperado: c.esperadoEnCaja,
      contado: c.counted,
      diferencia: c.difference,
      pendientes: c.l.pendientes.total,
    },
  });

  revalidatePath('/admin/caja');
  revalidatePath('/admin/finanzas');

  /* El final del día (estrategia §2.7, R3): cuánto se vendió y, si lo es,
     el récord. Le llega al dueño como aviso aunque no esté en el local.
     Nada de esto puede tumbar el cierre, que ya quedó escrito. */
  let dia: CajaCloseResult['dia'] = null;
  try {
    const t = await getTuDia(input.restaurantId, ctx.tz, c.l.dia);
    if (t) dia = { ventas: t.ventasHoy, pedidos: t.pedidosHoy, record: t.record };
  } catch { /* sin resumen: el cierre sigue */ }
  if (dia && dia.pedidos > 0) {
    const cifra = `Vendiste ${fmtMoney(dia.ventas)} en ${dia.pedidos} ${dia.pedidos === 1 ? 'pedido' : 'pedidos'}`;
    void sendPushToRestaurant(input.restaurantId, {
      title: dia.record ? `🏆 ${dia.record.texto}` : 'Tu día, hasta este cierre',
      body: `${cifra}. ${c.difference === 0 || Math.abs(c.difference) < 0.005 ? 'La caja cuadró.' : 'Revisa el cuadre de la caja.'}`,
      tag: `resumen-${c.l.dia}`,
      url: '/admin',
      type: 'resumen_dia',
    }).catch(() => { /* sin aviso */ });
  }

  // La celebración del día es de la pantalla anterior al identificador durable.
  // El contrato con identidad devuelve el mismo resultado en cada recuperación.
  return { result: { ...confirmado.recibo, dia: input.intentoId ? null : dia } };
}
