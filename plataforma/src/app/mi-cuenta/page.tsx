import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMyRestaurantCards, getMyGroupPanel, canBill } from '@/lib/db/membership';
import { getEffectivePlanPricing } from '@/lib/db/billing';
import { rootDomainForUrls } from '@/lib/tenant';
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

  const [cards, pricing, groupPanel] = await Promise.all([
    getMyRestaurantCards(),
    getEffectivePlanPricing(),
    getMyGroupPanel(),
  ]);

  // Sin ningún restaurante: no hay cuenta que administrar todavía. Se le manda
  // a crear el primero en vez de enseñarle una pantalla vacía. (Un dueño de
  // grupo sí tiene algo que ver aunque no tenga tarjetas: su panel del grupo.)
  if (cards.length === 0 && !groupPanel) redirect('/registro');

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle();

  return (
    <MiCuentaClient
      cards={cards}
      pricing={pricing}
      rootDomain={rootDomainForUrls()}
      accountName={(profile?.full_name as string | null) ?? user.email ?? 'tu cuenta'}
      accountEmail={user.email ?? ''}
      // Sin restaurantes todavía es justo quien MÁS necesita el botón: el
      // alta de la calle crea solo la cuenta y aterriza aquí.
      canCreate={cards.length === 0 || cards.some((c) => canBill(c.role))}
      groupPanel={groupPanel}
    />
  );
}
