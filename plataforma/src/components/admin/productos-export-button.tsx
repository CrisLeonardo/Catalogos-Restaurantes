'use client';

import { useTransition } from 'react';
import { useToastManager } from '@/components/ui/toast';
import { exportProductsXlsx, getProductsPdfData, type ProductExportRow } from '@/lib/actions/products';
import {
  createDoc, drawPdfHeader, brandedAutoTable, getLastAutoTableFinalY, pageBreakIfNeeded, finalizePdf, INK_RGB,
} from '@/lib/documents/pdf';
import { formatDocMoney, longDate } from '@/lib/documents/format';
import ExportMenu from '@/components/admin/export-menu';

function groupByCategory(rows: ProductExportRow[]): [string, ProductExportRow[]][] {
  const order: string[] = [];
  const groups = new Map<string, ProductExportRow[]>();
  for (const r of rows) {
    if (!groups.has(r.categoryName)) { groups.set(r.categoryName, []); order.push(r.categoryName); }
    groups.get(r.categoryName)!.push(r);
  }
  return order.map((name) => [name, groups.get(name)!]);
}

export default function ProductosExportButton({ restaurantId }: { restaurantId: string }) {
  const [pendingXlsx, startXlsx] = useTransition();
  const [pendingPdf, startPdf] = useTransition();
  const toast = useToastManager();

  function downloadXlsx() {
    startXlsx(async () => {
      const res = await exportProductsXlsx(restaurantId);
      if (res.error || !res.xlsx) { toast.add({ title: res.error ?? 'No se pudo exportar.', type: 'error' }); return; }
      const binary = atob(res.xlsx);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename ?? 'productos.xlsx';
      a.click();
      URL.revokeObjectURL(url);
      toast.add({ title: 'Excel descargado', type: 'success' });
    });
  }

  function downloadPdf() {
    startPdf(async () => {
      const res = await getProductsPdfData(restaurantId);
      if ('error' in res) { toast.add({ title: res.error, type: 'error' }); return; }
      const { rows, branding, slug } = res;
      const money = (n: number) => formatDocMoney(n, branding);

      const doc = await createDoc({ format: 'a4', orientation: 'p' });
      let y = await drawPdfHeader(doc, {
        branding,
        title: 'Catálogo de productos',
        subtitle: `${rows.length} producto${rows.length === 1 ? '' : 's'}`,
      });

      for (const [categoryName, items] of groupByCategory(rows)) {
        y = pageBreakIfNeeded(doc, y);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11.5);
        doc.setTextColor(...INK_RGB);
        doc.text(categoryName, 14, y);
        y += 4;

        const anyStock = items.some((p) => p.trackStock);
        const anyCost = items.some((p) => p.cost != null);
        const head = ['Producto', 'Precio'];
        if (anyCost) head.push('Costo', 'Margen');
        if (anyStock) head.push('Stock');
        head.push('Estado');

        await brandedAutoTable(doc, branding, {
          startY: y,
          head: [head],
          body: items.map((p) => {
            const row = [p.name, money(p.price)];
            if (anyCost) row.push(p.cost != null ? money(p.cost) : '—', p.cost != null ? money(p.price - p.cost) : '—');
            if (anyStock) row.push(p.trackStock ? String(p.stock ?? 0) : '—');
            row.push(!p.isActive ? 'Oculto' : !p.isAvailable ? 'Agotado' : 'Disponible');
            return row;
          }),
          columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
        });
        y = getLastAutoTableFinalY(doc) + 9;
      }

      finalizePdf(doc, { branding, generatedAtLabel: longDate(new Date().toISOString()) });
      doc.save(`productos-${slug}-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.add({ title: 'PDF descargado', type: 'success' });
    });
  }

  return (
    <ExportMenu
      onExcel={downloadXlsx}
      onPdf={downloadPdf}
      busy={pendingXlsx ? 'excel' : pendingPdf ? 'pdf' : null}
    />
  );
}
