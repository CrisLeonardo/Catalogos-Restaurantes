'use client';

import { useTransition, useState } from 'react';
import { exportSalesReportXlsx, getSalesReportData } from '@/lib/actions/finanzas';

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

  async function downloadPdf() {
    setErr(null);
    startPdf(async () => {
      const res = await getSalesReportData(restaurantId, from, to);
      if (res.error || !res.report) { setErr(res.error ?? 'No se pudo exportar.'); return; }
      const r = res.report;

      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');

      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text('Reporte de Ventas', 14, 18);
      doc.setFontSize(10);
      doc.setTextColor(120);
      doc.text(`${r.from} a ${r.to}`, 14, 25);
      doc.setTextColor(0);

      autoTable(doc, {
        startY: 31,
        head: [['Métrica', 'Valor']],
        body: [
          ['Pedidos', String(r.orders)],
          ['Ingreso bruto', `Q${r.revenue.toFixed(2)}`],
          ['Ingreso productos', `Q${r.productRevenue.toFixed(2)}`],
          ['Envíos', `Q${r.deliveryRevenue.toFixed(2)}`],
          ['Costo', `Q${r.cost.toFixed(2)}`],
          ['Utilidad', `Q${r.profit.toFixed(2)}`],
          ['Margen %', r.marginPct != null ? `${r.marginPct.toFixed(1)}%` : 'n/d'],
          ['Ticket promedio', `Q${r.avgTicket.toFixed(2)}`],
        ],
        styles: { fontSize: 10 },
        headStyles: { fillColor: [30, 30, 30] },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const y1: number = (doc as any).lastAutoTable.finalY + 10;
      doc.setFontSize(12);
      doc.text('Ventas por día', 14, y1);
      autoTable(doc, {
        startY: y1 + 4,
        head: [['Fecha', 'Pedidos', 'Ingreso']],
        body: r.series.map((d) => [d.date, String(d.orders), `Q${d.revenue.toFixed(2)}`]),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [30, 30, 30] },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const y2: number = (doc as any).lastAutoTable.finalY + 10;
      doc.setFontSize(12);
      doc.text('Productos por ingreso', 14, y2);
      autoTable(doc, {
        startY: y2 + 4,
        head: [['Producto', 'Cant.', 'Ingreso', 'Costo', 'Utilidad']],
        body: r.topByRevenue.map((p) => [
          p.name, String(p.qty),
          `Q${p.revenue.toFixed(2)}`, `Q${p.cost.toFixed(2)}`, `Q${p.profit.toFixed(2)}`,
        ]),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [30, 30, 30] },
      });

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
        {pendingXlsx ? '…' : '⬇ Excel'}
      </button>
      <button
        onClick={downloadPdf}
        disabled={pendingPdf}
        className="press glass-quiet"
        style={{ ...btnStyle, opacity: pendingPdf ? 0.7 : 1, cursor: pendingPdf ? 'not-allowed' : 'pointer' }}
      >
        {pendingPdf ? '…' : '⬇ PDF'}
      </button>
      {err && <span style={{ fontSize: 12, color: '#f87171' }}>{err}</span>}
    </div>
  );
}
