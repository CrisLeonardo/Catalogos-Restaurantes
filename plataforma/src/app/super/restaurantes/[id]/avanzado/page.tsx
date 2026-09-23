import { notFound } from 'next/navigation';
import { Glass } from '@/components/glass';
import DeleteButton from '@/components/admin/delete-button';
import { getRestaurantFullById } from '@/lib/db/super-admin';
import { deleteRestaurant, duplicateRestaurant } from '@/lib/actions/super-admin';

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
              Se borrará todo: menú, categorías, productos y tema. Irreversible.
            </div>
          </div>
          <DeleteButton
            action={deleteRestaurant}
            hiddenFields={{ id: row.id }}
            label="Eliminar"
            confirm={`¿Eliminar "${row.name}" y todos sus datos? Esta acción no se puede deshacer.`}
          />
        </Glass>
      </section>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, marginBottom: 14, color: 'var(--u-text)' }}>
      {children}
    </h2>
  );
}
