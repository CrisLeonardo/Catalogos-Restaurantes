'use client';

import { useTransition, useState } from 'react';
import { Icon } from '@/components/icons';
import { exportCustomersXlsx, getCustomersPdfData } from '@/lib/actions/customers';
import { createDoc, drawPdfHeader, brandedAutoTable, finalizePdf } from '@/lib/documents/pdf';
import { formatDocMoney, longDate } from '@/lib/documents/format';

export default function ClientesExportButton({ restaurantId }: { restaurantId: string }) {
  const [pendingXlsx, startXlsx] = useTransition();
  const [pendingPdf, startPdf] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function downloadXlsx() {
    setErr(null);
    startXlsx(async () => {
      const res = await exportCustomersXlsx(restaurantId);
      if (res.error || !res.xlsx) { setErr(res.error ?? 'No se pudo exportar.'); return; }
      const binary = atob(res.xlsx);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename ?? 'clientes.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  function downloadPdf() {
    setErr(null);
    startPdf(async () => {
      const res = await getCustomersPdfData(restaurantId);
      if ('error' in res) { setErr(res.error); return; }
      const { rows, branding, includeLoyalty, slug } = res;
      const money = (n: number) => formatDocMoney(n, branding);

      const doc = await createDoc({ format: 'a4', orientation: 'l' });
      const y = await drawPdfHeader(doc, {
        branding,
        title: 'Listado de clientes',
        subtitle: `${rows.length} cliente${rows.length === 1 ? '' : 's'}`,
      });

      const head = ['Nombre', 'Teléfono', 'Email', 'Dirección', 'Zona', 'Pedidos', 'Total gastado', 'Primer pedido', 'Último pedido'];
      if (includeLoyalty) head.push('Puntos');

      await brandedAutoTable(doc, branding, {
        startY: y,
        head: [head],
        body: rows.map((c) => {
          const base = [
            c.name, c.phone, c.email ?? '', c.default_address ?? '', c.default_zone ?? '',
            String(c.total_orders), money(c.total_spent),
            c.first_order_at?.slice(0, 10) ?? '', c.last_order_at?.slice(0, 10) ?? '',
          ];
          if (includeLoyalty) base.push(String(c.pointsBalance ?? 0));
          return base;
        }),
        styles: { fontSize: 8 },
        columnStyles: { 5: { halign: 'right' }, 6: { halign: 'right' } },
      });

      finalizePdf(doc, { branding, generatedAtLabel: longDate(new Date().toISOString()) });
      doc.save(`clientes-${slug}-${new Date().toISOString().slice(0, 10)}.pdf`);
    });
  }

  const btnStyle = (pending: boolean): React.CSSProperties => ({
    padding: '8px 14px', borderRadius: 10, border: 'none',
    fontSize: 13, fontWeight: 600, color: 'var(--u-text-2)',
    cursor: pending ? 'not-allowed' : 'pointer', opacity: pending ? 0.7 : 1,
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button onClick={downloadXlsx} disabled={pendingXlsx} className="press glass-quiet" style={btnStyle(pendingXlsx)}>
        {pendingXlsx ? '…' : <><Icon name="download" size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> Excel</>}
      </button>
      <button onClick={downloadPdf} disabled={pendingPdf} className="press glass-quiet" style={btnStyle(pendingPdf)}>
        {pendingPdf ? '…' : <><Icon name="download" size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> PDF</>}
      </button>
      {err && <span style={{ fontSize: 12, color: 'var(--c-danger, #f87171)' }}>{err}</span>}
    </div>
  );
}
