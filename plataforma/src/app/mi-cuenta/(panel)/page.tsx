import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMyRestaurantCards } from '@/lib/db/membership';
import { getMyGroupScope } from '@/lib/db/group';
import { isSyntheticStaffEmail } from '@/lib/staff-email';
import { getEffectivePlanPricing } from '@/lib/db/billing';
import MiCuentaClient from './mi-cuenta-client';

export const metadata: Metadata = {
  title: 'Mis restaurantes — Leogin',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * MIS RESTAURANTES — la lista, primera sección de Mi cuenta (mig. 112).
 *
 * Lo que se ve aquí depende del ROL en cada restaurante, no de un privilegio
 * de la pantalla:
 *  · dueño  → sus restaurantes, y el botón de crear otro;
 *  · gerente → solo las sucursales donde lo invitaron, sin cobro ni crear.
 *
 * Por eso a un gerente de UNA sola sucursal ni siquiera le hace falta pasar
 * por aquí: el login lo manda directo a su panel.
 *
 * El consolidado del grupo son las OTRAS secciones (resumen, comparativa,
 * finanzas), que el marco de esta carpeta enseña a quien tiene dos o más
 * restaurantes propios.
 */
export default async function MiCuentaPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/admin/login');

  const [cards, pricing, scope, { data: profile }] = await Promise.all([
    getMyRestaurantCards(),
    getEffectivePlanPricing(),
    getMyGroupScope(),
    supabase.from('profiles').select('full_name, restaurant_id').eq('id', user.id).maybeSingle(),
  ]);

  // Sin tarjetas pero con un restaurante "de casa" en el perfil: o las
  // membresías no están aplicadas, o la fila se perdió. Enseñarle aquí un
  // "crea tu primer restaurante" sería mentirle sobre lo que ya tiene, así
  // que se le devuelve al camino de siempre.
  if (cards.length === 0 && !scope && profile?.restaurant_id) redirect('/registro');

  return (
    <MiCuentaClient
      cards={cards}
      pricing={pricing}
      accountName={(profile?.full_name as string | null) ?? user.email ?? 'tu cuenta'}
      // Misma regla que aplica el servidor en createAnotherRestaurant: crea
      // quien tiene una identidad propia. Solo queda fuera la cuenta de PIN
      // del local, que es una credencial de turno, no una persona.
      canCreate={!isSyntheticStaffEmail(user.email)}
      groupName={scope?.isGroup ? scope.name : null}
    />
  );
}
