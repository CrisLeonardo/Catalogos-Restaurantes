/* ============================================================
   RECIBO DE PAGO EN PDF — cobros de Leogin a sus restaurantes
   ------------------------------------------------------------
   Genera un comprobante descargable por cada factura PAGADA,
   para enviárselo al dueño por WhatsApp/correo. Corre 100% en
   el navegador (jsPDF por import dinámico: no pesa en el bundle
   inicial). Sin dependencias de servidor.
   ============================================================ */

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

const SYMBOLS: Record<string, string> = { GTQ: 'Q', MXN: '$', USD: '$', EUR: '€' };

function money(n: number, currency: string): string {
  const sym = SYMBOLS[currency] ?? `${currency} `;
  return `${sym}${(n ?? 0).toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function longDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}`;
}

function periodLabel(period?: string | null): string | null {
  if (!period) return null;
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return period;
  return `${MONTHS[m - 1]} ${y}`;
}

/** Genera y descarga el PDF del recibo. */
export async function downloadReceipt(data: ReceiptData): Promise<void> {
  const { jsPDF } = await import('jspdf');
  // A5 apaisado no: A5 vertical se lee bien en el teléfono del dueño.
  const doc = new jsPDF({ unit: 'mm', format: 'a5' });
  const W = doc.internal.pageSize.getWidth();   // 148
  const M = 16;                                  // margen

  const ACCENT: [number, number, number] = [217, 119, 87];
  const INK: [number, number, number] = [24, 24, 27];
  const MUTE: [number, number, number] = [113, 113, 122];

  // ── Cabecera ──
  doc.setFillColor(...ACCENT);
  doc.rect(0, 0, W, 3, 'F');

  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('Leogin', M, 20);

  doc.setFontSize(10);
  doc.setTextColor(...MUTE);
  doc.setFont('helvetica', 'normal');
  doc.text('Menús digitales para restaurantes', M, 26);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...INK);
  doc.text('RECIBO DE PAGO', W - M, 20, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTE);
  doc.text(`Folio ${data.folio}`, W - M, 26, { align: 'right' });

  doc.setDrawColor(228, 228, 231);
  doc.line(M, 32, W - M, 32);

  // ── Datos ──
  let y = 42;
  const row = (label: string, value: string) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...MUTE);
    doc.text(label.toUpperCase(), M, y);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...INK);
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
  doc.setTextColor(...MUTE);
  doc.text('MONTO PAGADO', M + 7, y + 8);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(...ACCENT);
  doc.text(money(data.amount, data.currency), M + 7, y + 17);

  // ── Pie ──
  const H = doc.internal.pageSize.getHeight();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTE);
  doc.text('Gracias por tu pago. Este comprobante confirma que tu cuenta está al día por el concepto indicado.', M, H - 18, { maxWidth: W - M * 2 });
  doc.text(`Generado el ${longDate(new Date().toISOString())} · Leogin`, M, H - 9);

  const safeName = data.restaurantName.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ ]/g, '').trim().replace(/\s+/g, '-').toLowerCase();
  doc.save(`recibo-${safeName}-${data.folio}.pdf`);
}
