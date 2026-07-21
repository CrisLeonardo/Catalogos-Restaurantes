'use client';

/* Exporta el consolidado financiero del grupo a Excel/PDF reales, con la
   marca (logo/color/nombre) de la organización. El servidor re-deriva el
   reporte (getGroupReport) y resuelve la marca — este componente solo
   dispara la descarga y dibuja el PDF con la librería compartida. */

import { useTransition, useState } from 'react';
import { Icon } from '@/components/icons';
import { exportGroupFinanceXlsx, getGroupFinancePdfData } from '@/lib/actions/group-finance';
import { createDoc, drawPdfHeader, brandedAutoTable, getLastAutoTableFinalY, finalizePdf } from '@/lib/documents/pdf';
import { formatDocMoney, formatDateRangeLabel, longDate } from '@/lib/documents/format';

export default function GroupFinanceExport({ from, to }: { from: string; to: string }) {
  const [pendingXlsx, startXlsx] = useTransition();
  const [pendingPdf, startPdf] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function downloadXlsx() {
    setErr(null);
    startXlsx(async () => {
      const res = await exportGroupFinanceXlsx(from, to);
      if (res.error || !res.xlsx) { setErr(res.error ?? 'No se pudo exportar.'); return; }
      const binary = atob(res.xlsx);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename ?? 'finanzas-grupo.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  function downloadPdf() {
    setErr(null);
    startPdf(async () => {
      const res = await getGroupFinancePdfData(from, to);
      if ('error' in res) { setErr(res.error); return; }
      const { report, branding } = res;
      const money = (n: number) => formatDocMoney(n, branding);

      const doc = await createDoc({ format: 'a4', orientation: 'p' });
      const y = await drawPdfHeader(doc, {
        branding,
        title: 'Reporte financiero de grupo',
        subtitle: formatDateRangeLabel(from, to),
      });

      const rightAlign = { 1: { halign: 'right' as const }, 2: { halign: 'right' as const }, 3: { halign: 'right' as const }, 4: { halign: 'right' as const }, 5: { halign: 'right' as const }, 6: { halign: 'right' as const } };

      await brandedAutoTable(doc, branding, {
        startY: y,
        head: [['Sucursal', 'Ingreso', 'Costo', 'Utilidad', 'Margen %', 'Pedidos', 'Ticket promedio']],
        body: report.perBranch.map((b) => {
          const cost = b.revenue - b.profit;
          const margin = b.revenue > 0 ? (b.profit / b.revenue) * 100 : 0;
          const ticket = b.orders > 0 ? b.revenue / b.orders : 0;
          return [b.name, money(b.revenue), money(cost), money(b.profit), `${margin.toFixed(1)}%`, String(b.orders), money(ticket)];
        }),
        columnStyles: rightAlign,
      });

      const totalCost = report.totalRevenue - report.totalProfit;
      const totalMargin = report.totalRevenue > 0 ? (report.totalProfit / report.totalRevenue) * 100 : 0;
      const totalTicket = report.totalOrders > 0 ? report.totalRevenue / report.totalOrders : 0;

      await brandedAutoTable(doc, branding, {
        startY: getLastAutoTableFinalY(doc),
        showHead: 'never',
        body: [[
          'TOTAL GRUPO', money(report.totalRevenue), money(totalCost), money(report.totalProfit),
          `${totalMargin.toFixed(1)}%`, String(report.totalOrders), money(totalTicket),
        ]],
        styles: { fontStyle: 'bold' },
        columnStyles: rightAlign,
      });

      finalizePdf(doc, { branding, generatedAtLabel: longDate(new Date().toISOString()) });
      doc.save(`finanzas-grupo_${from}_a_${to}.pdf`);
    });
  }

  const btnStyle = (pending: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap',
    padding: '10px 14px', borderRadius: 12, border: '1px solid var(--u-hair)',
    color: 'var(--u-text-2)', fontSize: 13, fontWeight: 600, background: 'transparent',
    cursor: pending ? 'not-allowed' : 'pointer', opacity: pending ? 0.7 : 1,
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button type="button" onClick={downloadXlsx} disabled={pendingXlsx} className="press glass-quiet" style={btnStyle(pendingXlsx)}>
        <Icon name="download" size={15} /> {pendingXlsx ? '…' : 'Excel'}
      </button>
      <button type="button" onClick={downloadPdf} disabled={pendingPdf} className="press glass-quiet" style={btnStyle(pendingPdf)}>
        <Icon name="download" size={15} /> {pendingPdf ? '…' : 'PDF'}
      </button>
      {err && <span style={{ fontSize: 12, color: 'var(--c-danger, #f87171)' }}>{err}</span>}
    </div>
  );
}
