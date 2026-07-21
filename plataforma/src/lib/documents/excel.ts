/* ============================================================
   EXCEL DE MARCA — helpers compartidos (SOLO SERVIDOR)
   ------------------------------------------------------------
   Mismo lenguaje visual que pdf.ts: banda de acento con el nombre
   de la marca, encabezados de tabla con ese mismo acento, moneda
   con formato numérico real (no texto). exceljs se importa
   dinámicamente adentro de cada función.

   Decisión: el logo NO se incrusta como imagen en Excel (exceljs
   exige tamaño en píxeles que no tenemos barato sin una dependencia
   nueva, y muchos logos son SVG que tampoco podría incrustar). La
   banda de color + nombre en negrita ya se lee como "marca" en una
   hoja de cálculo sin ese riesgo.
   ============================================================ */

import type { Workbook, Worksheet, Row, Cell } from 'exceljs';
import type { DocumentBranding } from './types';

function argb(hex: string): string {
  return `FF${hex.replace('#', '').toUpperCase()}`;
}

export async function createBrandedWorkbook(): Promise<Workbook> {
  const { Workbook: Wb } = await import('exceljs');
  const wb = new Wb();
  wb.creator = 'Leogin';
  wb.created = new Date();
  return wb;
}

/**
 * Banda de marca en las primeras filas de la hoja: fila 1 = nombre+título con
 * relleno de acento; fila 2 = subtítulo (rango de fechas / generado el...).
 * `compact` = solo la fila 1, más delgada (para hojas secundarias del mismo
 * reporte, sin repetir el bloque completo). Devuelve la primera fila libre.
 */
export function addBrandedHeader(
  ws: Worksheet,
  opts: { branding: DocumentBranding; title: string; subtitle?: string; columnsSpan: number; compact?: boolean },
): number {
  const { branding, title, subtitle, columnsSpan, compact } = opts;
  const span = Math.max(1, columnsSpan);
  const fill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: argb(branding.accentHex) } };
  const textColor = { argb: argb(branding.onAccentHex) };

  const titleRow = ws.addRow([`${branding.name} — ${title}`]);
  ws.mergeCells(titleRow.number, 1, titleRow.number, span);
  for (let c = 1; c <= span; c++) titleRow.getCell(c).fill = fill;
  titleRow.getCell(1).font = { bold: true, size: compact ? 11 : 14, color: textColor };
  titleRow.height = compact ? 18 : 24;

  if (compact) return titleRow.number + 1;

  const subtitleRow = ws.addRow([subtitle ?? '']);
  ws.mergeCells(subtitleRow.number, 1, subtitleRow.number, span);
  subtitleRow.getCell(1).font = { italic: true, size: 9.5, color: { argb: 'FF71717A' } };

  ws.addRow([]);
  return subtitleRow.number + 2;
}

/** Encabezado de tabla en negrita + relleno de acento (solo estilo, ver `freezeHeaderRow` para congelar). */
export function styleTableHeaderRow(ws: Worksheet, rowNumber: number, branding: DocumentBranding): void {
  const row = ws.getRow(rowNumber);
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(branding.accentHex) } };
    cell.font = { bold: true, color: { argb: argb(branding.onAccentHex) } };
    cell.alignment = { vertical: 'middle' };
  });
}

/**
 * Congela los paneles arriba de `rowNumber` (esa fila queda siempre visible al
 * bajar). Se separa de `styleTableHeaderRow` porque una misma hoja puede tener
 * varias mini-tablas apiladas (Resumen: KPIs + canal + pago + zona) y solo la
 * PRIMERA debe fijar el congelado — llamarlo por cada tabla pisaría el punto
 * de congelado de la anterior.
 */
export function freezeHeaderRow(ws: Worksheet, rowNumber: number): void {
  ws.views = [{ state: 'frozen', ySplit: rowNumber }];
}

/** Escribe un encabezado con estilo de marca + filas de datos, en secuencia desde
    la posición actual de la hoja (no inserta — asume que se llama en orden).
    `currencyCols` da formato de moneda real a esas columnas (1-indexed). */
export function writeStyledTable(
  ws: Worksheet,
  branding: DocumentBranding,
  headers: string[],
  rows: (string | number | null)[][],
  opts?: { currencyCols?: number[] },
): { headerRow: number; lastRow: number } {
  const headerRow = ws.addRow(headers);
  styleTableHeaderRow(ws, headerRow.number, branding);
  rows.forEach((r) => ws.addRow(r));
  const lastRow = headerRow.number + rows.length;
  if (opts?.currencyCols?.length) applyCurrencyFormat(ws, opts.currencyCols, branding);
  if (rows.length > 1) zebraStripe(ws, headerRow.number + 1, lastRow, headers.length);
  return { headerRow: headerRow.number, lastRow };
}

/** Ancho de columna aproximado al contenido más largo (con tope). */
export function autoFitColumns(ws: Worksheet, opts?: { min?: number; max?: number }): void {
  const min = opts?.min ?? 10;
  const max = opts?.max ?? 42;
  for (let i = 1; i <= ws.actualColumnCount; i++) {
    const col = ws.getColumn(i);
    let longest = min;
    col.eachCell({ includeEmpty: true }, (cell) => {
      const len = String(cell.value ?? '').length;
      if (len > longest) longest = len;
    });
    col.width = Math.min(max, longest + 2);
  }
}

/** Formato numérico de moneda real (nunca texto) según símbolo/posición de la marca. */
export function currencyNumFmt(branding: DocumentBranding): string {
  const sym = branding.currencySymbol.replace(/"/g, '');
  return branding.currencyPosition === 'suffix' ? `#,##0.00"${sym}"` : `"${sym}"#,##0.00`;
}

export function applyCurrencyFormat(ws: Worksheet, colNumbers: number[], branding: DocumentBranding): void {
  const fmt = currencyNumFmt(branding);
  colNumbers.forEach((c) => { ws.getColumn(c).numFmt = fmt; });
}

/** Formato de moneda en UNA celda — a diferencia de `applyCurrencyFormat` (toda una
    columna), útil en tablas verticales clave/valor donde una misma columna mezcla
    montos, conteos y porcentajes fila por fila (ej. el resumen de KPIs). */
export function setCurrencyCell(cell: Cell, branding: DocumentBranding): void {
  cell.numFmt = currencyNumFmt(branding);
}

export const PERCENT_NUM_FMT = '0.0"%"';

/** Negrita + borde superior, para una fila de totales. */
export function styleTotalsRow(row: Row): void {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { bold: true };
    cell.border = { top: { style: 'thin', color: { argb: 'FF71717A' } } };
  });
}

/** Sombreado alterno (cebra) en el cuerpo de una tabla ya escrita. */
export function zebraStripe(ws: Worksheet, startRow: number, endRow: number, colCount: number): void {
  for (let r = startRow; r <= endRow; r++) {
    if ((r - startRow) % 2 === 0) continue;
    const row = ws.getRow(r);
    for (let c = 1; c <= colCount; c++) {
      row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFAFB' } };
    }
  }
}

export async function workbookToBase64(wb: Workbook): Promise<string> {
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf).toString('base64');
}
