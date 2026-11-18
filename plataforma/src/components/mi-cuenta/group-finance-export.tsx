'use client';

/* Exporta el reporte financiero de Mi cuenta a Excel/PDF reales, con la
   marca del negocio (la de la organización si hay grupo, la del restaurante
   si es uno solo). El servidor re-deriva el reporte (getGroupReport),
   resuelve la marca y comprueba el plan — este componente solo dispara la
   descarga y dibuja el PDF con la librería compartida. */

import { useState, useTransition } from 'react';
import { HojaOperativa } from '@/components/ui/hoja-operativa';
import n from '@/components/admin/negocio.module.css';
import { Icon } from '@/components/icons';
import { useToastManager } from '@/components/ui/toast';
import { exportGroupFinanceXlsx, getGroupFinancePdfData } from '@/lib/actions/group-finance';
import { createDoc, drawPdfHeader, brandedAutoTable, getLastAutoTableFinalY, finalizePdf } from '@/lib/documents/pdf';
import { formatDocMoney, formatDateRangeLabel, longDate } from '@/lib/documents/format';
import { cifrasDeCosto } from '@/lib/finanzas-cobertura';

/* «Descargar» (línea N, 2026-11-18): Excel y PDF en una hoja, como en
   Finanzas del panel. */
export default function GroupFinanceExport({ from, to, resumen }: { from: string; to: string; resumen?: string }) {
  const [hoja, setHoja] = useState(false);
  const [pendingXlsx, startXlsx] = useTransition();
  const [pendingPdf, startPdf] = useTransition();
  const toast = useToastManager();

  function downloadXlsx() {
    startXlsx(async () => {
      const res = await exportGroupFinanceXlsx(from, to);
      if (res.error || !res.xlsx) { toast.add({ title: res.error ?? 'No se pudo exportar.', type: 'error' }); return; }
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
      setHoja(false);
      toast.add({ title: 'Excel descargado', type: 'success' });
    });
  }

  function downloadPdf() {
    startPdf(async () => {
      const res = await getGroupFinancePdfData(from, to);
      if ('error' in res) { toast.add({ title: res.error, type: 'error' }); return; }
      const { report, branding, title } = res;
      const money = (n: number) => formatDocMoney(n, branding);

      const doc = await createDoc({ format: 'a4', orientation: 'p' });
      const y = await drawPdfHeader(doc, {
        branding,
        title,
        subtitle: formatDateRangeLabel(from, to),
      });

      const rightAlign = { 1: { halign: 'right' as const }, 2: { halign: 'right' as const }, 3: { halign: 'right' as const }, 4: { halign: 'right' as const }, 5: { halign: 'right' as const }, 6: { halign: 'right' as const } };

      await brandedAutoTable(doc, branding, {
        startY: y,
        head: [['Sucursal', 'Ingreso', 'Costo', 'Utilidad', 'Margen %', 'Pedidos', 'Ticket promedio']],
        // Costo desconocido no es Q0 ni margen 0 % (auditoría 2026-11-03, X21).
        body: report.perBranch.map((b) => {
          const c = cifrasDeCosto(b);
          const ticket = b.orders > 0 ? b.revenue / b.orders : 0;
          return [
            b.name, money(b.revenue),
            c.costo == null ? 'Sin datos' : money(c.costo),
            c.utilidad == null ? 'Sin datos' : money(c.utilidad),
            c.margen == null ? '—' : `${c.margen.toFixed(1)}%`,
            String(b.orders), money(ticket),
          ];
        }),
        columnStyles: rightAlign,
      });

      const total = cifrasDeCosto({
        productRevenue: report.totalProductRevenue, costedRevenue: report.totalCostedRevenue,
        cost: report.totalCost, profit: report.totalProfit, marginPct: report.totalMarginPct,
      });
      const totalTicket = report.totalOrders > 0 ? report.totalRevenue / report.totalOrders : 0;

      await brandedAutoTable(doc, branding, {
        startY: getLastAutoTableFinalY(doc),
        showHead: 'never',
        body: [[
          report.perBranch.length > 1 ? 'TOTAL GRUPO' : 'TOTAL', money(report.totalRevenue),
          total.costo == null ? 'Sin datos' : money(total.costo),
          total.utilidad == null ? 'Sin datos' : money(total.utilidad),
          total.margen == null ? '—' : `${total.margen.toFixed(1)}%`, String(report.totalOrders), money(totalTicket),
        ]],
        styles: { fontStyle: 'bold' },
        columnStyles: rightAlign,
      });

      finalizePdf(doc, { branding, generatedAtLabel: longDate(new Date().toISOString()) });
      doc.save(`finanzas_${from}_a_${to}.pdf`);
      setHoja(false);
      toast.add({ title: 'PDF descargado', type: 'success' });
    });
  }

  const ocupado = pendingXlsx || pendingPdf;

  return (
    <>
      <button type="button" className={n.descargar} aria-label="Descargar el reporte" onClick={() => setHoja(true)}>
        <Icon name="download" size={18} />
        <span>Descargar</span>
      </button>
      {hoja && (
        <HojaOperativa
          label="Descargar el reporte"
          resumen={resumen ? <p className={n.nota}>{resumen}</p> : undefined}
          onClose={() => setHoja(false)}
          footer={null}
        >
          <ul className={n.opciones} aria-busy={ocupado || undefined}>
            <li>
              <button type="button" className={n.opcion} disabled={ocupado} onClick={downloadXlsx}>
                <span>{pendingXlsx ? 'Preparando el Excel…' : 'Excel, para tu contador'}</span><em>.xlsx</em>
              </button>
            </li>
            <li>
              <button type="button" className={n.opcion} disabled={ocupado} onClick={downloadPdf}>
                <span>{pendingPdf ? 'Preparando el PDF…' : 'PDF, para imprimir o enviar'}</span><em>.pdf</em>
              </button>
            </li>
          </ul>
        </HojaOperativa>
      )}
    </>
  );
}
