'use client';

import { useState, useTransition } from 'react';
import { HojaOperativa } from '@/components/ui/hoja-operativa';
import s from './negocio.module.css';
import { Icon } from '@/components/icons';
import { useToastManager } from '@/components/ui/toast';
import { exportSalesReportXlsx, getSalesReportData } from '@/lib/actions/finanzas';
import type { Split } from '@/lib/db/reports';
import type { ReportProduct } from '@/lib/db/reports';
import {
  createDoc, drawPdfHeader, brandedAutoTable, getLastAutoTableFinalY,
  pageBreakIfNeeded, finalizePdf, INK_RGB,
} from '@/lib/documents/pdf';
import { formatDocMoney, formatDateRangeLabel, longDate } from '@/lib/documents/format';

/* «Descargar» (línea N, 2026-11-18): Excel y PDF juntos en una hoja,
   cada uno diciendo para qué sirve. Antes eran dos botones fijos. */
export default function ExportReportButton({
  restaurantId, from, to, resumen,
}: { restaurantId: string; from: string; to: string; resumen?: string }) {
  const [hoja, setHoja] = useState(false);
  const [pendingXlsx, startXlsx] = useTransition();
  const [pendingPdf, startPdf] = useTransition();
  const toast = useToastManager();

  function downloadXlsx() {
    startXlsx(async () => {
      const res = await exportSalesReportXlsx(restaurantId, from, to);
      if (res.error || !res.xlsx) { toast.add({ title: res.error ?? 'No se pudo exportar.', type: 'error' }); return; }
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
      setHoja(false);
      toast.add({ title: 'Excel descargado', type: 'success' });
    });
  }

  function downloadPdf() {
    startPdf(async () => {
      const res = await getSalesReportData(restaurantId, from, to);
      if (res.error || !res.report || !res.branding) { toast.add({ title: res.error ?? 'No se pudo exportar.', type: 'error' }); return; }
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
          ['Ingreso por platillos', money(r.productRevenue)],
          ['Envíos', money(r.deliveryRevenue)],
          ['Propinas', money(r.tips)],
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
          head: [['Platillo', 'Cant.', 'Ingreso', 'Costo', 'Utilidad']],
          body: rows.map((p) => [p.name, String(p.qty), money(p.revenue), money(p.cost), money(p.profit)]),
          columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
        });
        y = getLastAutoTableFinalY(doc) + 9;
      };
      await productTable('Más vendidos (por ingreso)', r.topByRevenue);
      await productTable('Más rentables (por utilidad)', r.topByProfit);

      finalizePdf(doc, { branding, generatedAtLabel: longDate(new Date().toISOString()) });
      doc.save(`reporte-ventas-${r.from}_a_${r.to}.pdf`);
      setHoja(false);
      toast.add({ title: 'PDF descargado', type: 'success' });
    });
  }

  const ocupado = pendingXlsx || pendingPdf;

  return (
    <>
      <button type="button" className={s.descargar} aria-label="Descargar el reporte" onClick={() => setHoja(true)}>
        <Icon name="download" size={18} />
        <span>Descargar</span>
      </button>
      {hoja && (
        <HojaOperativa
          label="Descargar el reporte"
          resumen={resumen ? <p className={s.nota}>{resumen}</p> : undefined}
          className="hoja-negocio"
          onClose={() => setHoja(false)}
          footer={null}
        >
          <ul className={s.opciones} aria-busy={ocupado || undefined}>
            <li>
              <button type="button" className={s.opcion} disabled={ocupado} onClick={downloadXlsx}>
                <span>{pendingXlsx ? 'Preparando el Excel…' : 'Excel, para tu contador'}</span><em>.xlsx</em>
              </button>
            </li>
            <li>
              <button type="button" className={s.opcion} disabled={ocupado} onClick={downloadPdf}>
                <span>{pendingPdf ? 'Preparando el PDF…' : 'PDF, para imprimir o enviar'}</span><em>.pdf</em>
              </button>
            </li>
          </ul>
        </HojaOperativa>
      )}
    </>
  );
}
