'use client';

import { useTransition, useState } from 'react';
import { exportSalesReportCsv } from '@/lib/actions/finanzas';

/* Descarga el reporte de ventas del rango como CSV (Excel lo abre directo). */
export default function ExportReportButton({
  restaurantId, from, to,
}: { restaurantId: string; from: string; to: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function download() {
    setErr(null);
    start(async () => {
      const res = await exportSalesReportCsv(restaurantId, from, to);
      if (res.error || !res.csv) { setErr(res.error ?? 'No se pudo exportar.'); return; }
      const blob = new Blob([res.csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename ?? 'reporte.csv';
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button
        onClick={download}
        disabled={pending}
        className="press glass-quiet"
        style={{
          padding: '8px 14px', borderRadius: 10, border: 'none',
          cursor: pending ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600,
          color: 'var(--u-text-2)', opacity: pending ? 0.7 : 1,
        }}
      >
        {pending ? '…' : '⬇ Exportar CSV'}
      </button>
      {err && <span style={{ fontSize: 12, color: '#f87171' }}>{err}</span>}
    </div>
  );
}
