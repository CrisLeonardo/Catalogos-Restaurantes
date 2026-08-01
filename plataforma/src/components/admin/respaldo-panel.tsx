'use client';

import { useState, useTransition } from 'react';
import { Icon } from '@/components/icons';
import { exportBackupXlsx } from '@/lib/actions/backup';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function RespaldoPanel({ restaurantId }: { restaurantId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function download() {
    setError(null);
    setDone(false);
    start(async () => {
      const res = await exportBackupXlsx(restaurantId);
      if (res.error || !res.xlsx) { setError(res.error ?? 'No se pudo generar el respaldo.'); return; }
      const binary = atob(res.xlsx);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename ?? 'respaldo.xlsx';
      a.click();
      URL.revokeObjectURL(url);
      setDone(true);
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
      <p style={{ fontSize: 13.5, color: 'var(--u-text-3)' }}>
        Descarga una copia completa de tus datos en un solo archivo Excel — pensada para respaldo o portabilidad,
        no para leer en el panel (para reportes del día a día usa las secciones de Catálogo, Clientes o Pedidos).
      </p>

      <Card className="flex flex-col gap-4 p-5">
        <div>
          <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Incluye 4 hojas</p>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--u-text-2)' }}>
            <li>· Catálogo — todos tus platillos, precio, costo y stock</li>
            <li>· Categorías — tu menú tal como está organizado</li>
            <li>· Clientes — nombre, contacto, dirección y su historial de compra</li>
            <li>· Pedidos — hasta los últimos 5,000 pedidos, con productos y totales</li>
          </ul>
        </div>

        <Button onClick={download} disabled={pending} className="self-start rounded-adm-full">
          {pending
            ? 'Generando…'
            : <><Icon name="download" size={15} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} /> Descargar respaldo completo (.xlsx)</>}
        </Button>

        {done && !error && <p style={{ fontSize: 12.5, color: 'var(--c-ok)' }}>Listo — revisa tus descargas.</p>}
        {error && <p style={{ fontSize: 12.5, color: 'var(--c-danger)' }}>{error}</p>}
      </Card>

      <p style={{ fontSize: 12, color: 'var(--u-text-4)' }}>
        Este archivo incluye datos personales de tus clientes — guárdalo con el mismo cuidado que cualquier otro
        documento sensible de tu negocio.
      </p>
    </div>
  );
}
