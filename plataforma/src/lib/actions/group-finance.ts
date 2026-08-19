'use server';

/* ============================================================
   FINANZAS DE GRUPO — export a PDF/Excel (marca de organización)
   ------------------------------------------------------------
   Reusa getGroupContext() (mismo auth que /central/finanzas:
   el jefe del grupo por su organización, SUPER_ADMIN por x-org-slug) y
   re-deriva el reporte en servidor vía getGroupReport — nunca se
   confía en números que mande el cliente.
   ============================================================ */

import { getGroupContext, getGroupReport, type GroupReport } from '@/lib/db/group';
import { resolveRestaurantBranding, resolveOrganizationBranding } from '@/lib/documents/branding';
import {
  createBrandedWorkbook, addBrandedHeader, writeStyledTable, freezeHeaderRow, autoFitColumns,
  setCurrencyCell, PERCENT_NUM_FMT, styleTotalsRow, workbookToBase64,
} from '@/lib/documents/excel';
import { formatDateRangeLabel, longDate } from '@/lib/documents/format';
import type { DocumentBranding } from '@/lib/documents/types';

type GroupFinanceData = {
  report: GroupReport;
  branding: DocumentBranding;
  orgSlug: string;
};

async function authAndBuildGroupReport(from: string, to: string): Promise<GroupFinanceData | { error: string }> {
  const ctx = await getGroupContext();
  if (!ctx) return { error: 'No autorizado.' };
  if (ctx.branches.length === 0) return { error: 'El grupo no tiene sucursales.' };

  const [report, restaurantBrand] = await Promise.all([
    getGroupReport(ctx.branches, from, to),
    // La moneda no vive en Organization ni en el reporte de grupo: se toma
    // de la primera sucursal (supuesto documentado: un grupo, una moneda).
    resolveRestaurantBranding(ctx.branches[0].id),
  ]);

  const branding = await resolveOrganizationBranding(ctx.org, {
    symbol: restaurantBrand.currencySymbol,
    position: restaurantBrand.currencyPosition,
    locale: restaurantBrand.locale,
  });

  return { report, branding, orgSlug: ctx.org.slug };
}

/** Datos ya armados (reporte + marca de organización) para dibujar el PDF en el cliente. */
export async function getGroupFinancePdfData(from: string, to: string): Promise<GroupFinanceData | { error: string }> {
  return authAndBuildGroupReport(from, to);
}

/** Genera el reporte financiero de grupo como .xlsx real, con marca de la organización. */
export async function exportGroupFinanceXlsx(
  from: string,
  to: string,
): Promise<{ xlsx?: string; filename?: string; error?: string }> {
  const data = await authAndBuildGroupReport(from, to);
  if ('error' in data) return data;
  const { report, branding, orgSlug } = data;

  const subtitle = `${formatDateRangeLabel(from, to)} · Generado el ${longDate(new Date().toISOString())}`;
  const wb = await createBrandedWorkbook();
  const ws = wb.addWorksheet('Finanzas de grupo');

  const headers = ['Sucursal', 'Ingreso', 'Costo', 'Utilidad', 'Margen %', 'Pedidos', 'Ticket promedio'];
  addBrandedHeader(ws, { branding, title: 'Reporte financiero de grupo', subtitle, columnsSpan: headers.length });

  const rows = report.perBranch.map((b) => {
    const cost = b.revenue - b.profit;
    const margin = b.revenue > 0 ? (b.profit / b.revenue) * 100 : 0;
    const ticket = b.orders > 0 ? b.revenue / b.orders : 0;
    return [b.name, b.revenue, cost, b.profit, margin, b.orders, ticket];
  });

  const { headerRow } = writeStyledTable(ws, branding, headers, rows, { currencyCols: [2, 3, 4, 7] });
  ws.getColumn(5).numFmt = PERCENT_NUM_FMT;

  const totalCost = report.totalRevenue - report.totalProfit;
  const totalMargin = report.totalRevenue > 0 ? (report.totalProfit / report.totalRevenue) * 100 : 0;
  const totalTicket = report.totalOrders > 0 ? report.totalRevenue / report.totalOrders : 0;
  const totalsRow = ws.addRow([
    'TOTAL GRUPO', report.totalRevenue, totalCost, report.totalProfit, totalMargin, report.totalOrders, totalTicket,
  ]);
  styleTotalsRow(totalsRow);
  [2, 3, 4, 7].forEach((c) => setCurrencyCell(totalsRow.getCell(c), branding));
  totalsRow.getCell(5).numFmt = PERCENT_NUM_FMT;

  freezeHeaderRow(ws, headerRow);
  autoFitColumns(ws);

  const xlsx = await workbookToBase64(wb);
  return { xlsx, filename: `finanzas-grupo-${orgSlug}_${from}_a_${to}.xlsx` };
}
