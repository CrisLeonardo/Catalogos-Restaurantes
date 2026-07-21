/* ============================================================
   FORMATO COMPARTIDO — fechas en español + moneda por documento
   ------------------------------------------------------------
   Funciones puras, seguras en cliente y servidor. `formatDocMoney`
   usa la moneda YA RESUELTA de la marca (símbolo/posición/locale) —
   distinto del mapa código→símbolo de @/lib/money.ts, que formatea
   la moneda de COBRO de Leogin (GTQ/MXN/USD/EUR), un concepto aparte.
   ============================================================ */

import type { DocumentBranding } from './types';

export const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** "21 de julio de 2026" a partir de un ISO. */
export function longDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}`;
}

/** "julio 2026" a partir de un periodo YYYY-MM. */
export function periodLabel(period?: string | null): string | null {
  if (!period) return null;
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return period;
  return `${MONTHS[m - 1]} ${y}`;
}

function shortDate(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  if (isNaN(d.getTime())) return ymd;
  return `${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

/** "1 de julio de 2026 – 21 de julio de 2026" (o un solo día si from === to). */
export function formatDateRangeLabel(from: string, to: string): string {
  if (from === to) return shortDate(from);
  return `${shortDate(from)} – ${shortDate(to)}`;
}

/** Monto con la moneda real del documento (símbolo/posición/locale de la marca). */
export function formatDocMoney(n: number, branding: DocumentBranding, decimals = 2): string {
  let num: string;
  try {
    num = (n ?? 0).toLocaleString(branding.locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  } catch {
    num = (n ?? 0).toLocaleString('es-GT', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }
  return branding.currencyPosition === 'suffix' ? `${num}${branding.currencySymbol}` : `${branding.currencySymbol}${num}`;
}
