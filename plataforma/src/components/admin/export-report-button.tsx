'use client';

import { useTransition, useState } from 'react';
import { Icon } from '@/components/icons';
import { exportSalesReportXlsx, getSalesReportData } from '@/lib/actions/finanzas';
import type { Split } from '@/lib/db/reports';
import type { ReportProduct } from '@/lib/db/reports';
import {
  createDoc, drawPdfHeader, brandedAutoTable, getLastAutoTableFinalY,
  pageBreakIfNeeded, finalizePdf, INK_RGB,
} from '@/lib/documents/pdf';
import { formatDocMoney, formatDateRangeLabel, longDate } from '@/lib/documents/format';

export default function ExportReportButton({
  restaurantId, from, to,
}: { restaurantId: string; from: string; to: string }) {
  const [pendingXlsx, startXlsx] = useTransition();
  const [pendingPdf, startPdf] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function downloadXlsx() {
    setErr(null);
    startXlsx(async () => {
      const res = await exportSalesReportXlsx(restaurantId, from, to);
      if (res.error || !res.xlsx) { setErr(res.error ?? 'No se pudo exportar.'); return; }
      const binary = atob(res.xlsx);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename ?? 'reporte.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  function downloadPdf() {
    setErr(null);
    startPdf(async () => {
      const res = await getSalesReportData(restaurantId, from, to);
      if (res.error || !res.report || !res.branding) { setErr(res.error ?? 'No se pudo exportar.'); return; }
      const r = res.report;
      const branding = res.branding;
      const money = (n: number) => formatDocMoney(n, branding);

      const doc = await createDoc({ format: 'a4', orientation: 'p' });
      let y = await drawPdfHeader(doc, {
        branding,
        title: 'Reporte de ventas',
        subtitle: formatDateRangeLabel(from, to),
      });

      await brandedAutoTable(doc, branding, {
        startY: y,
        head: [['Métrica', 'Valor']],
        body: [
          ['Pedidos', String(r.orders)],
          ['Ingreso bruto', money(r.revenue)],
          ['Ingreso de productos', money(r.productRevenue)],
          ['Envíos', money(r.deliveryRevenue)],
          ['Costo', money(r.cost)],
          ['Utilidad', money(r.profit)],
          ['Margen %', r.marginPct != null ? `${r.marginPct.toFixed(1)}%` : 'n/d'],
          ['Ticket promedio', money(r.avgTicket)],
        ],
        columnStyles: { 1: { halign: 'right' } },
      });
      y = getLastAutoTableFinalY(doc) + 9;

      const sectionTitle = (title: string) => {
        y = pageBreakIfNeeded(doc, y);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(...INK_RGB);
        doc.text(title, 14, y);
        y += 4;
      };

      const splitTable = async (title: string, rows: Split[]) => {
        if (rows.length === 0) return;
        sectionTitle(title);
        await brandedAutoTable(doc, branding, {
          startY: y,
          head: [[title, 'Pedidos', 'Ingreso']],
          body: rows.map((x) => [x.label, String(x.orders), money(x.revenue)]),
          columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
        });
        y = getLastAutoTableFinalY(doc) + 9;
      };
      await splitTable('Canal', r.byChannel);
      await splitTable('Método de pago', r.byPayment);
      await splitTable('Zona de entrega', r.byZone);

      const productTable = async (title: string, rows: ReportProduct[]) => {
        if (rows.length === 0) return;
        sectionTitle(title);
        await brandedAutoTable(doc, branding, {
          startY: y,
          head: [['Producto', 'Cant.', 'Ingreso', 'Costo', 'Utilidad']],
          body: rows.map((p) => [p.name, String(p.qty), money(p.revenue), money(p.cost), money(p.profit)]),
          columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
        });
        y = getLastAutoTableFinalY(doc) + 9;
      };
      await productTable('Más vendidos (por ingreso)', r.topByRevenue);
      await productTable('Más rentables (por utilidad)', r.topByProfit);

      finalizePdf(doc, { branding, generatedAtLabel: longDate(new Date().toISOString()) });
      doc.save(`reporte-ventas-${r.from}_a_${r.to}.pdf`);
    });
  }

  const btnStyle: React.CSSProperties = {
    padding: '8px 14px', borderRadius: 10, border: 'none',
    fontSize: 13, fontWeight: 600, color: 'var(--u-text-2)', cursor: 'pointer',
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button
        onClick={downloadXlsx}
        disabled={pendingXlsx}
        className="press glass-quiet"
        style={{ ...btnStyle, opacity: pendingXlsx ? 0.7 : 1, cursor: pendingXlsx ? 'not-allowed' : 'pointer' }}
      >
        {pendingXlsx ? '…' : <><Icon name="download" size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> Excel</>}
      </button>
      <button
        onClick={downloadPdf}
        disabled={pendingPdf}
        className="press glass-quiet"
        style={{ ...btnStyle, opacity: pendingPdf ? 0.7 : 1, cursor: pendingPdf ? 'not-allowed' : 'pointer' }}
      >
        {pendingPdf ? '…' : <><Icon name="download" size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> PDF</>}
      </button>
      {err && <span style={{ fontSize: 12, color: 'var(--c-danger, #f87171)' }}>{err}</span>}
    </div>
  );
}
