import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMyRestaurantCards, getMyGroupPanel } from '@/lib/db/membership';
import { isSyntheticStaffEmail } from '@/lib/staff-email';
import { getEffectivePlanPricing } from '@/lib/db/billing';
import MiCuentaClient from './mi-cuenta-client';

export const metadata: Metadata = {
  title: 'Mi cuenta — Leogin',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * MI CUENTA — el hogar de quien tiene uno o varios restaurantes (mig. 112).
 *
 * Lo que se ve aquí depende del ROL en cada restaurante, no de un privilegio
 * de la pantalla:
 *  · dueño  → sus restaurantes, y el botón de crear otro;
 *  · gerente → solo las sucursales donde lo invitaron, sin cobro ni crear.
 *
 * Por eso a un gerente de UNA sola sucursal ni siquiera le hace falta pasar
 * por aquí: el login lo manda directo a su panel.
 */
export default async function MiCuentaPage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    redirect('/');
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/admin/login');

  const [cards, pricing, groupPanel, { data: profile }] = await Promise.all([
    getMyRestaurantCards(),
    getEffectivePlanPricing(),
    getMyGroupPanel(),
    supabase.from('profiles').select('full_name, restaurant_id').eq('id', user.id).maybeSingle(),
  ]);

  // Sin tarjetas pero con un restaurante "de casa" en el perfil: o las
  // membresías no están aplicadas, o la fila se perdió. Enseñarle aquí un
  // "crea tu primer restaurante" sería mentirle sobre lo que ya tiene, así
  // que se le devuelve al camino de siempre.
  if (cards.length === 0 && !groupPanel && profile?.restaurant_id) redirect('/registro');

  return (
    <MiCuentaClient
      cards={cards}
      pricing={pricing}
      accountName={(profile?.full_name as string | null) ?? user.email ?? 'tu cuenta'}
      accountEmail={user.email ?? ''}
      // Misma regla que aplica el servidor en createAnotherRestaurant: crea
      // quien tiene una identidad propia. Solo queda fuera la cuenta de PIN
      // del local, que es una credencial de turno, no una persona.
      canCreate={!isSyntheticStaffEmail(user.email)}
      groupPanel={groupPanel}
    />
  );
}
