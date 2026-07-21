/* ============================================================
   PDF DE MARCA — helpers compartidos (SOLO CLIENTE)
   ------------------------------------------------------------
   Un mismo lenguaje visual para todos los documentos: barra de
   acento arriba, cabecera con logo/nombre/subtítulo + título del
   documento, tablas con el acento de la marca, pie con paginación.
   jsPDF/jspdf-autotable se importan dinámicamente adentro de cada
   función — este módulo no pesa nada hasta que alguien descarga
   un documento.
   ============================================================ */

import type { jsPDF } from 'jspdf';
import type { UserOptions } from 'jspdf-autotable';
import { hexToRgb } from '@/lib/theme/resolve';
import { LEOGIN_INK, LEOGIN_MUTED, type DocumentBranding } from './types';

/** Tintas neutras compartidas por todo documento (cuerpo de texto, no la marca). */
export const INK_RGB = hexToRgb(LEOGIN_INK);
export const MUTED_RGB = hexToRgb(LEOGIN_MUTED);
export const HAIRLINE_RGB: [number, number, number] = [228, 228, 231];

export async function createDoc(opts?: { format?: 'a4' | 'a5'; orientation?: 'p' | 'l' }): Promise<jsPDF> {
  const { jsPDF: JsPDF } = await import('jspdf');
  return new JsPDF({ unit: 'mm', format: opts?.format ?? 'a4', orientation: opts?.orientation ?? 'p' });
}

/**
 * Carga el logo (mismo origen — /api/doc-logo/..., sin problema de CORS),
 * lo re-codifica a PNG vía canvas (así no depende de que jsPDF sepa leer el
 * formato original, sea PNG/JPEG/WEBP) y lo dibuja ajustado dentro de la
 * caja `maxW`×`maxH` (mm) sin deformarlo. Cualquier falla (sin logo, fetch
 * roto, navegador sin createImageBitmap) se traga y no dibuja nada — el
 * documento cae a solo texto, nunca revienta por esto.
 */
async function drawLogo(
  doc: jsPDF,
  logoUrl: string,
  x: number,
  y: number,
  maxW: number,
  maxH: number,
): Promise<{ w: number; h: number } | null> {
  try {
    const res = await fetch(logoUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);

    const aspect = bitmap.width / bitmap.height || 1;
    let w = maxW;
    let h = w / aspect;
    if (h > maxH) { h = maxH; w = h * aspect; }

    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) { bitmap.close(); return null; }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    doc.addImage(canvas.toDataURL('image/png'), 'PNG', x, y, w, h);
    return { w, h };
  } catch {
    return null;
  }
}

/**
 * Barra de acento + cabecera de marca (logo/nombre/subtítulo a la izquierda,
 * título del documento + subtítulo del rango/folio a la derecha) + línea
 * fina. Devuelve la Y (mm) donde debe empezar el contenido del cuerpo.
 */
export async function drawPdfHeader(
  doc: jsPDF,
  opts: { branding: DocumentBranding; title: string; subtitle?: string },
): Promise<number> {
  const { branding, title, subtitle } = opts;
  const W = doc.internal.pageSize.getWidth();
  const M = 14;

  doc.setFillColor(...branding.accentRgb);
  doc.rect(0, 0, W, 2.6, 'F');

  let logoW = 0;
  if (branding.logoUrl) {
    const fitted = await drawLogo(doc, branding.logoUrl, M, 7, 24, 13);
    if (fitted) logoW = fitted.w + 5;
  }

  const nameX = M + logoW;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...INK_RGB);
  doc.text(branding.name, nameX, 15.5);

  if (branding.subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED_RGB);
    doc.text(branding.subtitle, nameX, 20.5);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(...INK_RGB);
  doc.text(title.toUpperCase(), W - M, 15.5, { align: 'right' });

  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED_RGB);
    doc.text(subtitle, W - M, 20.5, { align: 'right' });
  }

  doc.setDrawColor(...HAIRLINE_RGB);
  doc.line(M, 26, W - M, 26);

  return 33;
}

/** Wrapper de autoTable con los estilos de marca por defecto (el caller puede sobreescribir cualquiera). */
export async function brandedAutoTable(
  doc: jsPDF,
  branding: DocumentBranding,
  options: UserOptions,
): Promise<void> {
  const { default: autoTable } = await import('jspdf-autotable');
  autoTable(doc, {
    ...options,
    styles: { fontSize: 9, textColor: INK_RGB, lineColor: HAIRLINE_RGB, lineWidth: 0.1, ...options.styles },
    headStyles: { fillColor: branding.accentRgb, textColor: hexToRgb(branding.onAccentHex), fontStyle: 'bold', ...options.headStyles },
    alternateRowStyles: { fillColor: [250, 250, 251], ...options.alternateRowStyles },
  });
}

/** Wrapper tipado de `doc.lastAutoTable.finalY` (sin `any` disperso en cada llamador). */
export function getLastAutoTableFinalY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

/**
 * Salto de página manual antes de dibujar algo que autoTable no controla
 * (un título de sección suelto, por ejemplo). autoTable pagina solo sus
 * propias tablas; sin esto, un título dibujado con `doc.text()` cerca del
 * borde inferior quedaría huérfano en una página y su tabla en la siguiente.
 */
export function pageBreakIfNeeded(doc: jsPDF, y: number, neededMm = 30): number {
  const H = doc.internal.pageSize.getHeight();
  if (y > H - neededMm) {
    doc.addPage();
    return 20;
  }
  return y;
}

/** Pie de página (línea + "Generado el… · marca" + "Página X de Y") en TODAS las páginas ya dibujadas. */
export function finalizePdf(doc: jsPDF, opts: { branding: DocumentBranding; generatedAtLabel: string }): void {
  const { branding, generatedAtLabel } = opts;
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 14;
  const pageCount = doc.getNumberOfPages();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(...HAIRLINE_RGB);
    doc.line(M, H - 14, W - M, H - 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED_RGB);
    doc.text(`Generado el ${generatedAtLabel} · ${branding.name}`, M, H - 9);
    if (pageCount > 1) {
      doc.text(`Página ${i} de ${pageCount}`, W - M, H - 9, { align: 'right' });
    }
  }
}
