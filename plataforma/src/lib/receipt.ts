/* ============================================================
   RECIBO DE PAGO EN PDF — cobros de Leogin a sus restaurantes
   ------------------------------------------------------------
   Genera un comprobante descargable por cada factura PAGADA,
   para enviárselo al dueño por WhatsApp/correo. Corre 100% en
   el navegador. La cabecera/pie de marca salen de
   @/lib/documents/pdf (misma librería que usan los demás
   documentos descargables); el renderer de filas clave/valor y
   la caja de monto destacado son propios de este recibo.
   ============================================================ */

import { fmtMoney } from '@/lib/money';
import { longDate, periodLabel } from '@/lib/documents/format';
import { createDoc, drawPdfHeader, finalizePdf, INK_RGB, MUTED_RGB } from '@/lib/documents/pdf';
import { LEOGIN_BRANDING } from '@/lib/documents/types';

export interface ReceiptData {
  /** Folio corto legible (se muestra y va en el nombre del archivo). */
  folio: string;
  restaurantName: string;
  /** Descripción del cobro (ej. "Mensualidad 2026-07"). */
  concept: string;
  /** Periodo cubierto (YYYY-MM) si aplica. */
  period?: string | null;
  amount: number;
  currency: string;
  paidAt: string;          // ISO
  paymentMethod?: string | null;
  notes?: string | null;
}

const ACCENT = LEOGIN_BRANDING.accentRgb;

/** Genera y descarga el PDF del recibo. */
export async function downloadReceipt(data: ReceiptData): Promise<void> {
  // A5 vertical: se lee bien en el teléfono del dueño.
  const doc = await createDoc({ format: 'a5', orientation: 'p' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 14;

  let y = await drawPdfHeader(doc, {
    branding: LEOGIN_BRANDING,
    title: 'Recibo de pago',
    subtitle: `Folio ${data.folio}`,
  });
  y += 9; // aire antes de las filas clave/valor

  const row = (label: string, value: string) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED_RGB);
    doc.text(label.toUpperCase(), M, y);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...INK_RGB);
    const lines = doc.splitTextToSize(value, W - M * 2);
    doc.text(lines, M, y + 5.5);
    y += 5.5 + lines.length * 5 + 4;
  };

  row('Recibimos de', data.restaurantName);
  row('Concepto', data.concept + (periodLabel(data.period) ? ` — ${periodLabel(data.period)}` : ''));
  row('Fecha de pago', longDate(data.paidAt));
  if (data.paymentMethod) row('Método de pago', data.paymentMethod);
  if (data.notes) row('Notas', data.notes);

  // ── Monto destacado ──
  y += 2;
  doc.setFillColor(250, 245, 242);
  doc.setDrawColor(...ACCENT);
  doc.roundedRect(M, y, W - M * 2, 22, 2.5, 2.5, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED_RGB);
  doc.text('MONTO PAGADO', M + 7, y + 8);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(...ACCENT);
  doc.text(fmtMoney(data.amount, data.currency), M + 7, y + 17);

  // Nota de agradecimiento (propia del recibo, encima del pie compartido).
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED_RGB);
  doc.text(
    'Gracias por tu pago. Este comprobante confirma que tu cuenta está al día por el concepto indicado.',
    M, H - 19, { maxWidth: W - M * 2 },
  );

  finalizePdf(doc, { branding: LEOGIN_BRANDING, generatedAtLabel: longDate(new Date().toISOString()) });

  const safeName = data.restaurantName.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ ]/g, '').trim().replace(/\s+/g, '-').toLowerCase();
  doc.save(`recibo-${safeName}-${data.folio}.pdf`);
}
