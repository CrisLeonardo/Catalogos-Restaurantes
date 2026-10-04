'use client';

import { useTransition } from 'react';
import { Icon } from '@/components/icons';
import { useToastManager } from '@/components/ui/toast';
import { exportCashHistoryXlsx, getCashHistoryPdfData } from '@/lib/actions/finanzas';
import { createDoc, drawPdfHeader, brandedAutoTable, finalizePdf } from '@/lib/documents/pdf';
import { formatDocMoney, longDate } from '@/lib/documents/format';
import { labelOf } from '@/lib/payment-method';

function methodSummary(byMethod: Record<string, number> | null, money: (n: number) => string): string {
  if (!byMethod) return '';
  return Object.entries(byMethod)
    .map(([method, amount]) => `${labelOf(method)}: ${money(Number(amount))}`)
    .join(', ');
}

export default function CashHistoryExportButton({ restaurantId }: { restaurantId: string }) {
  const [pendingXlsx, startXlsx] = useTransition();
  const [pendingPdf, startPdf] = useTransition();
  const toast = useToastManager();

  function downloadXlsx() {
    startXlsx(async () => {
      const res = await exportCashHistoryXlsx(restaurantId);
      if (res.error || !res.xlsx) { toast.add({ title: res.error ?? 'No se pudo exportar.', type: 'error' }); return; }
      const binary = atob(res.xlsx);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename ?? 'arqueo-caja.xlsx';
      a.click();
      URL.revokeObjectURL(url);
      toast.add({ title: 'Excel descargado', type: 'success' });
    });
  }

  function downloadPdf() {
    startPdf(async () => {
      const res = await getCashHistoryPdfData(restaurantId);
      if (res.error || !res.rows || !res.branding) { toast.add({ title: res.error ?? 'No se pudo exportar.', type: 'error' }); return; }
      const { rows, branding, slug } = res;
      const money = (n: number) => formatDocMoney(n, branding);

      const doc = await createDoc({ format: 'a4', orientation: 'l' });
      const y = await drawPdfHeader(doc, {
        branding,
        title: 'Arqueo de caja',
        subtitle: `${rows.length} corte${rows.length === 1 ? '' : 's'}`,
      });

      await brandedAutoTable(doc, branding, {
        startY: y,
        head: [['Fecha', 'Turno', 'Cajero', 'Fondo inicial', 'Esperado', 'Contado', 'Diferencia', 'Por método', 'Notas']],
        body: rows.map((c) => [
          c.business_date, c.shift_label ?? '', c.cashier_name ?? '',
          money(Number(c.opening_float)), money(Number(c.expected_cash)), money(Number(c.counted_cash)), money(Number(c.difference)),
          methodSummary(c.by_method, money), c.notes ?? '',
        ]),
        styles: { fontSize: 8 },
        columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
      });

      finalizePdf(doc, { branding, generatedAtLabel: longDate(new Date().toISOString()) });
      doc.save(`arqueo-caja-${slug ?? 'restaurante'}-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.add({ title: 'PDF descargado', type: 'success' });
    });
  }

  const btnStyle = (pending: boolean): React.CSSProperties => ({
    padding: '5px 11px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--u-hair)',
    fontSize: 11, fontWeight: 600, color: 'var(--u-text-3)', background: 'transparent',
    cursor: pending ? 'not-allowed' : 'pointer', opacity: pending ? 0.7 : 1,
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <button onClick={downloadXlsx} disabled={pendingXlsx} className="press" style={btnStyle(pendingXlsx)}>
        {pendingXlsx ? '…' : <><Icon name="download" size={11} style={{ display: 'inline', verticalAlign: '-1px' }} /> Excel</>}
      </button>
      <button onClick={downloadPdf} disabled={pendingPdf} className="press" style={btnStyle(pendingPdf)}>
        {pendingPdf ? '…' : <><Icon name="download" size={11} style={{ display: 'inline', verticalAlign: '-1px' }} /> PDF</>}
      </button>
    </div>
  );
}
