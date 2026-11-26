import { notFound } from 'next/navigation';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import DeleteButton from '@/components/admin/delete-button';
import { getRestaurantFullById } from '@/lib/db/super-admin';
import { deleteRestaurant, duplicateRestaurant } from '@/lib/actions/super-admin';
import { avisoDeExportacion } from '@/lib/aviso-exportacion';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Avanzado — Super Admin' };

export default async function FichaAvanzadoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const row = await getRestaurantFullById(id);
  if (!row) notFound();
  // Se avisa, no se exige (LZ-10, decisión del dueño del 24 de noviembre).
  const exportacion = avisoDeExportacion(row.datos_exportados_at, row.timezone || undefined);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
      <section>
        <SectionTitle>Duplicar</SectionTitle>
        <Glass
          variant="quiet"
          style={{ padding: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}
        >
          <div style={{ minWidth: 220, flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--u-text)' }}>
              Duplicar restaurante
            </div>
            <div style={{ fontSize: 13, color: 'var(--u-text-4)', marginTop: 2 }}>
              Copia el tema, las categorías y los productos a un restaurante nuevo
              (queda suspendido hasta que lo actives). Ideal para arrancar un cliente
              con un diseño que ya te gustó.
            </div>
          </div>
          <form action={duplicateRestaurant}>
            <input type="hidden" name="id" value={row.id} />
            <button
              type="submit"
              className="press"
              style={{
                padding: '10px 18px', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 13,
                border: '1px solid var(--u-hair-2)', background: 'color-mix(in srgb, var(--u-text) 6%, transparent)',
                color: 'var(--u-text)', cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              Duplicar
            </button>
          </form>
        </Glass>
      </section>

      <section>
        <SectionTitle>Zona peligrosa</SectionTitle>
        <Glass
          variant="quiet"
          style={{
            padding: 20, border: '1px solid var(--c-danger-bg)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
          }}
        >
          <div style={{ minWidth: 220, flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--u-text)' }}>
              Eliminar restaurante
            </div>
            <div style={{ fontSize: 13, color: 'var(--u-text-4)', marginTop: 2 }}>
              Se borra todo: carta, pedidos, clientes y facturas FEL. Lo que Leogin le
              cobró queda en la bitácora.
            </div>
            {exportacion && (
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, marginTop: 8,
                  color: exportacion.exporto ? 'var(--c-ok)' : 'var(--c-warn)',
                }}
              >
                <Icon name={exportacion.exporto ? 'checkCircle' : 'alertCircle'} size={16} />
                {exportacion.linea}
              </div>
            )}
          </div>
          <DeleteButton
            action={deleteRestaurant}
            hiddenFields={{ id: row.id }}
            label="Eliminar"
            confirm={`¿Eliminar «${row.name}»?`}
            description="Se borran el restaurante y todos sus datos. Sus cobros de Leogin quedan en la bitácora. No se puede deshacer."
            warning={exportacion?.aviso}
            confirmLabel={exportacion?.confirmar ?? 'Eliminar'}
          />
        </Glass>
      </section>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontWeight: 600, fontSize: 15, marginBottom: 14, color: 'var(--u-text)' }}>
      {children}
    </h2>
  );
}
