'use client';

/* Exporta el consolidado financiero del grupo a CSV (control total para el
   dueño de franquicias). Genera el archivo en el navegador a partir de los
   datos ya renderizados — sin llamadas extra al servidor. */

import { Icon } from '@/components/icons';

export type ExportRow = {
  name: string;
  revenue: number;
  orders: number;
  profit: number;
};

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function GroupFinanceExport({
  rows,
  from,
  to,
  orgName,
}: {
  rows: ExportRow[];
  from: string;
  to: string;
  orgName: string;
}) {
  function download() {
    const header = ['Sucursal', 'Ingreso', 'Costo', 'Utilidad', 'Margen %', 'Pedidos', 'Ticket promedio'];
    const body = rows.map((r) => {
      const cost = r.revenue - r.profit;
      const margin = r.revenue > 0 ? (r.profit / r.revenue) * 100 : 0;
      const ticket = r.orders > 0 ? r.revenue / r.orders : 0;
      return [r.name, r.revenue.toFixed(2), cost.toFixed(2), r.profit.toFixed(2), margin.toFixed(1), r.orders, ticket.toFixed(2)];
    });
    // Fila de totales del grupo.
    const tRev = rows.reduce((s, r) => s + r.revenue, 0);
    const tProfit = rows.reduce((s, r) => s + r.profit, 0);
    const tOrders = rows.reduce((s, r) => s + r.orders, 0);
    body.push([
      'TOTAL GRUPO',
      tRev.toFixed(2),
      (tRev - tProfit).toFixed(2),
      tProfit.toFixed(2),
      (tRev > 0 ? (tProfit / tRev) * 100 : 0).toFixed(1),
      tOrders,
      (tOrders > 0 ? tRev / tOrders : 0).toFixed(2),
    ]);

    const lines = [
      [`Reporte financiero — ${orgName}`],
      [`Periodo: ${from} a ${to}`],
      [],
      header,
      ...body,
    ];
    const csv = '﻿' + lines.map((row) => row.map(csvCell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finanzas-grupo_${from}_${to}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={download}
      className="press glass-quiet"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap',
        padding: '10px 14px', borderRadius: 12, border: '1px solid var(--u-hair)',
        color: 'var(--u-text-2)', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'transparent',
      }}
    >
      <Icon name="download" size={15} /> Exportar CSV
    </button>
  );
}
