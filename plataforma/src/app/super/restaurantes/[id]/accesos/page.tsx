import { notFound } from 'next/navigation';
import { SavedBanner } from '@/components/super/ui';
import RestaurantUsers from '@/components/super/restaurant-users';
import { getRestaurantFullById, getRestaurantUsers } from '@/lib/db/super-admin';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Accesos — Super Admin' };

export default async function FichaAccesosPage({
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

  const users = await getRestaurantUsers(id);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {saved === 'user' && <SavedBanner message="Acceso creado. Entrega las credenciales al restaurante." />}
      {saved === 'pass' && <SavedBanner message="Contraseña actualizada." />}
      <p style={{ fontSize: 13, color: 'var(--u-text-4)', margin: 0, lineHeight: 1.55 }}>
        Crea el usuario y contraseña con los que el dueño entrará a gestionar su menú.
        Tú controlas estos accesos.
      </p>
      <RestaurantUsers key={row.id} restaurantId={row.id} slug={row.slug} users={users} />
    </div>
  );
}
