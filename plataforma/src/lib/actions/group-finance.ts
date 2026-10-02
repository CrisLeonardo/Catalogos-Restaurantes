'use server';

/* ============================================================
   FINANZAS DE MI CUENTA — export a PDF/Excel
   ------------------------------------------------------------
   Reusa getMyGroupScope() (el mismo candado que /mi-cuenta/finanzas: los
   restaurantes de los que esta persona es dueña, Y que su plan incluya los
   reportes) y re-deriva el reporte en servidor vía getGroupReport — nunca se
   confía en números que mande el cliente.

   El candado del plan se repite aquí a propósito: esconder el botón no es
   una defensa, la acción es una URL más.
   ============================================================ */

import { getMyGroupScope, getGroupReport, type GroupReport } from '@/lib/db/group';
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
  /** Título del documento: cambia si son varios restaurantes o uno. */
  title: string;
  /** Para el nombre del archivo. */
  slug: string;
};

async function authAndBuildGroupReport(from: string, to: string): Promise<GroupFinanceData | { error: string }> {
  const scope = await getMyGroupScope();
  if (!scope) return { error: 'No autorizado.' };
  if (!scope.hasFinance) return { error: 'Tu plan no incluye los reportes financieros.' };

  const [report, restaurantBrand] = await Promise.all([
    getGroupReport(scope.branches, from, to),
    // La moneda no vive en Organization ni en el reporte de grupo: se toma
    // del primer restaurante (supuesto documentado: un grupo, una moneda).
    resolveRestaurantBranding(scope.branches[0].id),
  ]);

  const currency = {
    symbol: restaurantBrand.currencySymbol,
    position: restaurantBrand.currencyPosition,
    locale: restaurantBrand.locale,
  };

  // Con organización, la marca del grupo. Sin ella —el reporte ya no la
  // exige— se toma el color del primer restaurante y el nombre del conjunto,
  // que es lo que la persona ve en pantalla.
  const branding: DocumentBranding = scope.org
    ? await resolveOrganizationBranding(scope.org, currency)
    : { ...restaurantBrand, kind: 'organization', name: scope.name, subtitle: null, logoUrl: null };

  return {
    report,
    branding,
    title: scope.isGroup ? 'Reporte financiero de grupo' : 'Reporte financiero',
    slug: scope.org?.slug ?? scope.branches[0].slug,
  };
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
  const { report, branding, title, slug } = data;

  const subtitle = `${formatDateRangeLabel(from, to)} · Generado el ${longDate(new Date().toISOString())}`;
  const wb = await createBrandedWorkbook();
  const ws = wb.addWorksheet('Finanzas');

  const headers = ['Sucursal', 'Ingreso', 'Costo', 'Utilidad', 'Margen %', 'Pedidos', 'Ticket promedio'];
  addBrandedHeader(ws, { branding, title, subtitle, columnsSpan: headers.length });

  const rows = report.perBranch.map((b) => {
    const cost = b.cost;
    const margin = b.marginPct ?? 0;
    const ticket = b.orders > 0 ? b.revenue / b.orders : 0;
    return [b.name, b.revenue, cost, b.profit, margin, b.orders, ticket];
  });

  const { headerRow } = writeStyledTable(ws, branding, headers, rows, { currencyCols: [2, 3, 4, 7] });
  ws.getColumn(5).numFmt = PERCENT_NUM_FMT;

  const totalCost = report.totalCost;
  const totalMargin = report.totalMarginPct ?? 0;
  const totalTicket = report.totalOrders > 0 ? report.totalRevenue / report.totalOrders : 0;
  const totalsRow = ws.addRow([
    report.perBranch.length > 1 ? 'TOTAL GRUPO' : 'TOTAL',
    report.totalRevenue, totalCost, report.totalProfit, totalMargin, report.totalOrders, totalTicket,
  ]);
  styleTotalsRow(totalsRow);
  [2, 3, 4, 7].forEach((c) => setCurrencyCell(totalsRow.getCell(c), branding));
  totalsRow.getCell(5).numFmt = PERCENT_NUM_FMT;

  freezeHeaderRow(ws, headerRow);
  autoFitColumns(ws);

  const xlsx = await workbookToBase64(wb);
  return { xlsx, filename: `finanzas-${slug}_${from}_a_${to}.xlsx` };
}
