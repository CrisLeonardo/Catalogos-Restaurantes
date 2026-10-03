import { notFound } from 'next/navigation';
import { getRestaurantFullById } from '@/lib/db/super-admin';
import { SavedBanner } from '@/components/super/ui';
import RestaurantEditForm from '@/components/super/restaurant-edit-form';
import RestaurantLocationEditor from '@/components/admin/restaurant-location-editor';
import type { Restaurant } from '@/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Información — Super Admin' };

export default async function FichaInformacionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;
  const row = await getRestaurantFullById(id);
  if (!row) notFound();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
      {saved === 'info' && <SavedBanner message="Información guardada." />}
      {saved === 'location' && <SavedBanner message="Ubicación y radio de entrega guardados." />}

      <section>
        <SectionTitle>Datos del restaurante</SectionTitle>
        {/* key={row.id}: fuerza re-montaje al cambiar de sucursal por navegación
            cliente; sin él, los inputs conservaban los datos de la anterior. */}
        <RestaurantEditForm key={row.id} restaurant={row} />
      </section>

      <section>
        <SectionTitle>Ubicación y radio de entrega</SectionTitle>
        <p style={{ fontSize: 13, color: 'var(--u-text-4)', marginTop: -8, marginBottom: 14 }}>
          Coloca el pin en el mapa y define hasta cuántos km llega el reparto.
          Las coordenadas alimentan el selector automático de sucursal del grupo.
        </p>
        <RestaurantLocationEditor key={row.id} restaurant={row as unknown as Restaurant} />
      </section>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontWeight: 650, fontSize: 15.5, marginBottom: 14, color: 'var(--u-text)' }}>
      {children}
    </h2>
  );
}
