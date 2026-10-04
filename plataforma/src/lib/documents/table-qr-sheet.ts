/* ============================================================
   HOJA DE QR DE MESA PARA IMPRIMIR (SOLO CLIENTE)
   ------------------------------------------------------------
   Antes había que bajar los QR de uno en uno («↓ PNG» en cada
   tarjeta): veinte mesas, veinte descargas y luego armarlas a mano
   en un documento (auditoría 2026-10-02, AJU-05). Esto arma un PDF
   A4 con seis por hoja —nombre del restaurante, QR, «Mesa N» y una
   línea punteada para recortar— listo para imprimir.

   Usa el mismo enlace ESTABLE de mesa que las tarjetas
   (`stableTableUrl`, /m/<slug>/<mesa>), que sigue sirviendo aunque
   cambie el slug (migración 134).
   ============================================================ */

import { createDoc, INK_RGB, MUTED_RGB } from '@/lib/documents/pdf';
import { qrPng } from '@/lib/documents/qr-art';
import { stableTableUrl } from '@/lib/tenant';

export async function downloadTableQrSheet(opts: {
  slug: string;
  restaurantName: string;
  tableCount: number;
}): Promise<void> {
  const { slug, restaurantName, tableCount } = opts;
  const tables = Array.from({ length: tableCount }, (_, i) => i + 1);

  // De a cuatro a la vez: veinte peticiones juntas al mismo endpoint no
  // ganan nada y en un teléfono con mala señal se atascan.
  const images: string[] = [];
  for (let i = 0; i < tables.length; i += 4) {
    const batch = await Promise.all(tables.slice(i, i + 4).map((n) => qrPng(stableTableUrl(slug, n))));
    images.push(...batch);
  }

  const doc = await createDoc({ format: 'a4', orientation: 'p' });
  const W = doc.internal.pageSize.getWidth();   // 210
  const H = doc.internal.pageSize.getHeight();  // 297
  const M = 12;
  const COLS = 2;
  const ROWS = 3;
  const cellW = (W - M * 2) / COLS;
  const cellH = (H - M * 2) / ROWS;
  const qr = Math.min(cellW, cellH) - 34;

  tables.forEach((n, idx) => {
    const slot = idx % (COLS * ROWS);
    if (idx > 0 && slot === 0) doc.addPage();
    const col = slot % COLS;
    const row = Math.floor(slot / COLS);
    const x = M + col * cellW;
    const y = M + row * cellH;
    const cx = x + cellW / 2;

    // Línea de corte.
    doc.setDrawColor(200, 200, 205);
    doc.setLineDashPattern([1.5, 1.5], 0);
    doc.rect(x + 2, y + 2, cellW - 4, cellH - 4);
    doc.setLineDashPattern([], 0);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...MUTED_RGB);
    doc.text(restaurantName, cx, y + 11, { align: 'center', maxWidth: cellW - 16 });

    // Comprimida ('FAST'): sin eso jsPDF guarda cada QR en crudo (600×600
    // RGB) y veinte mesas pesaban 21 MB.
    doc.addImage(images[idx], 'PNG', cx - qr / 2, y + 15, qr, qr, `mesa-${n}`, 'FAST');

    doc.setFontSize(20);
    doc.setTextColor(...INK_RGB);
    doc.text(`Mesa ${n}`, cx, y + 15 + qr + 9, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED_RGB);
    doc.text('Escanea para ver el menú y pedir', cx, y + 15 + qr + 15, { align: 'center' });
  });

  doc.save(`qr-mesas-${restaurantName.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'restaurante'}.pdf`);
}
