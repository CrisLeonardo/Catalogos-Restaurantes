'use client';

/* ============================================================
   COPIA DE TUS DATOS (/admin/respaldo)
   ------------------------------------------------------------
   Una pantalla de un solo botón. Lo único que había que arreglar
   era la forma de lo que rodea al botón: "Incluye 4 hojas" era un
   <p> en negrita y las cuatro hojas una lista con "·" escritos a
   mano dentro de la misma tarjeta. Ahora es lo que es —cuatro
   cosas enumerables— y se dibuja como se dibuja una enumeración
   en el resto del panel: un grupo con nombre y sus filas.
   ============================================================ */

import { useTransition } from 'react';
import { Icon } from '@/components/icons';
import { exportBackupXlsx } from '@/lib/actions/backup';
import { useReauth } from '@/components/auth/reauth';
import { Button } from '@/components/ui/button';
import { List, ListRow, ListText } from '@/components/ui/list';
import { Section, SectionNote } from '@/components/ui/section';
import { useToastManager } from '@/components/ui/toast';

const HOJAS = [
  { icon: 'bag', label: 'Catálogo', desc: 'Todos tus platillos, con precio, costo y existencias.' },
  { icon: 'grid', label: 'Categorías', desc: 'Tu menú tal como está organizado hoy.' },
  { icon: 'users', label: 'Clientes', desc: 'Nombre, contacto, dirección y su historial de compra.' },
  { icon: 'receipt', label: 'Pedidos', desc: 'Hasta los últimos 5.000, con sus productos y totales.' },
];

export default function RespaldoPanel({ restaurantId }: { restaurantId: string }) {
  const [pending, start] = useTransition();
  const toast = useToastManager();

  // ACC-09: el respaldo lleva TODO (clientes incluidos): se confirma identidad.
  const { asegurar, dialog } = useReauth();

  async function download() {
    // Antes de la transición: mientras el diálogo esté abierto el botón no
    // debe decir que ya se está generando.
    if (!(await asegurar())) return;
    start(async () => {
      const res = await exportBackupXlsx(restaurantId);
      if (res.error || !res.xlsx) { toast.add({ title: res.error ?? 'No se pudo generar el respaldo.', type: 'error' }); return; }
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
      toast.add({ title: 'Listo — revisa tus descargas', type: 'success' });
    });
  }

  return (
    <div className="adm-w-read flex flex-col gap-6">
      <p className="text-[14px] leading-snug" style={{ color: 'var(--u-text-3)' }}>
        Una copia completa de lo tuyo en un solo archivo de Excel, para guardarla
        donde quieras. Para los reportes del día a día están Catálogo, Clientes y
        Pedidos.
      </p>

      <Section title="Qué te llevas">
        <List>
          {HOJAS.map((h) => (
            <ListRow key={h.label}>
              <span
                className="grid size-7 shrink-0 place-items-center rounded-adm-md"
                style={{ background: 'color-mix(in srgb, var(--u-text) 8%, transparent)', color: 'var(--u-text-2)' }}
              >
                <Icon name={h.icon} size={16} />
              </span>
              <ListText title={h.label} desc={h.desc} />
            </ListRow>
          ))}
        </List>
        <SectionNote>
          Una hoja por cada cosa, dentro del mismo archivo.
        </SectionNote>
      </Section>

      <Button onClick={download} disabled={pending} className="self-start rounded-adm-full">
        <Icon name="download" size={15} />
        {pending ? 'Generando…' : 'Descargar la copia (.xlsx)'}
      </Button>

      <p className="text-[12px] leading-snug" style={{ color: 'var(--u-text-4)' }}>
        El archivo lleva datos personales de tus clientes: guárdalo con el mismo
        cuidado que cualquier otro documento sensible de tu negocio.
      </p>
      {dialog}
    </div>
  );
}
