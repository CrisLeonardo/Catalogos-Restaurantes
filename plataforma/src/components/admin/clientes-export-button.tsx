'use client';

import { useTransition } from 'react';
import { useToastManager } from '@/components/ui/toast';
import { exportCustomersXlsx, getCustomersPdfData } from '@/lib/actions/customers';
import { createDoc, drawPdfHeader, brandedAutoTable, finalizePdf } from '@/lib/documents/pdf';
import { formatDocMoney, longDate } from '@/lib/documents/format';
import ExportMenu from '@/components/admin/export-menu';
import { useReauth } from '@/components/auth/reauth';

export default function ClientesExportButton({ restaurantId }: { restaurantId: string }) {
  const [pendingXlsx, startXlsx] = useTransition();
  const [pendingPdf, startPdf] = useTransition();
  const toast = useToastManager();
  // ACC-09: la lista de clientes es dato personal de terceros → confirmar identidad.
  const { asegurar, dialog } = useReauth();

  async function downloadXlsx() {
    if (!(await asegurar())) return;
    startXlsx(async () => {
      const res = await exportCustomersXlsx(restaurantId);
      if (res.error || !res.xlsx) { toast.add({ title: res.error ?? 'No se pudo exportar.', type: 'error' }); return; }
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
      toast.add({ title: 'Excel descargado', type: 'success' });
    });
  }

  async function downloadPdf() {
    if (!(await asegurar())) return;
    startPdf(async () => {
      const res = await getCustomersPdfData(restaurantId);
      if ('error' in res) { toast.add({ title: res.error, type: 'error' }); return; }
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
      toast.add({ title: 'PDF descargado', type: 'success' });
    });
  }

  return (
    <>
      <ExportMenu
        onExcel={downloadXlsx}
        onPdf={downloadPdf}
        busy={pendingXlsx ? 'excel' : pendingPdf ? 'pdf' : null}
      />
      {dialog}
    </>
  );
}
