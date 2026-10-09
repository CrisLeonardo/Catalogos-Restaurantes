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
      {/* La frase de antes —«Crea el usuario y contraseña con los que el dueño
          entrará… Tú controlas estos accesos»— dejó de ser verdad el día que
          el registro pasó a ser self-service: la mayoría de los dueños crea su
          propia cuenta y tú no la controlas. Decirlo mal aquí es lo que hacía
          pensar que el modelo seguía siendo el de antes. */}
      <p style={{ fontSize: 13, color: 'var(--u-text-4)', margin: 0, lineHeight: 1.55 }}>
        Quién puede entrar a este restaurante y con qué papel. La mayoría llega con su
        propia cuenta de Leogin; desde aquí puedes darle acceso, cambiárselo o quitárselo.
        La cuenta en sí —su contraseña, su correo— se administra en <strong>Cuentas</strong>.
      </p>
      <RestaurantUsers
        key={row.id}
        restaurantId={row.id}
        slug={row.slug}
        users={users}
        whatsapp={((row as { whatsapp_number?: string | null }).whatsapp_number) ?? null}
      />
    </div>
  );
}
