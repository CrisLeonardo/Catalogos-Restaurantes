import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient, getStaffUser } from '@/lib/supabase/server';
import { getMyRestaurantCards } from '@/lib/db/membership';
import { getMyGroupScope, getGroupDashboard } from '@/lib/db/group';
import { isSyntheticStaffEmail } from '@/lib/staff-email';
import { getEffectivePlanPricing } from '@/lib/db/billing';
import { adminUrl, stableMenuSlugUrl, subdomainUrl } from '@/lib/tenant';
import MiCuentaClient, { type HoyDeUnRestaurante, type RestauranteSinTarjeta } from './mi-cuenta-client';

export const metadata: Metadata = {
  title: 'Mis restaurantes — Leogin',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * MIS RESTAURANTES — la primera sección de Mi cuenta (mig. 112).
 *
 * Lo que se ve aquí depende del ROL en cada restaurante, no de un privilegio
 * de la pantalla:
 *  · dueño  → sus restaurantes, y el botón de crear otro;
 *  · gerente → solo las sucursales donde lo invitaron, sin cobro ni crear.
 *
 * Por eso a un gerente de UNA sola sucursal ni siquiera le hace falta pasar
 * por aquí: el login lo manda directo a su panel.
 *
 * Línea N «nada saturado» (2026-11-18): aquí se fundió Resumen. Cada fila
 * dice cómo va HOY ese restaurante (día de negocio, `getOrderStats`) y avisa
 * lo que pide atención; arriba, una línea con la suma. El enlace del grupo
 * y «Equipo y accesos» pasan a hojas.
 */
export default async function MiCuentaPage({ searchParams }: { searchParams: Promise<{ acceso?: string }> }) {
  const acceso = (await searchParams).acceso;
  const supabase = await createClient();
  const { data: { user } } = await getStaffUser();
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
  if (cards.length === 0 && !scope && profile?.restaurant_id
      && acceso !== 'sin-permiso' && acceso !== 'no-disponible') redirect('/registro');

  const dash = scope ? await getGroupDashboard(scope.branches) : null;
  const hoy: Record<string, HoyDeUnRestaurante> = {};
  for (const b of dash?.branches ?? []) {
    hoy[b.id] = {
      ventas: b.todaySales, pedidos: b.todayOrders, ventas14: b.sales14,
      agotados: b.outStock, pausado: b.paused,
    };
  }

  /* Quien ve el grupo por la organización (el panel viejo de /central) puede
     no tener membresía en cada sucursal: también se listan, con su enlace
     directo al panel, para que fundir Resumen aquí no se las esconda. */
  const conTarjeta = new Set(cards.map((c) => c.restaurantId));
  const sinTarjeta: RestauranteSinTarjeta[] = (dash?.branches ?? [])
    .filter((b) => !conTarjeta.has(b.id))
    .map((b) => ({ id: b.id, name: b.name, slug: b.slug, href: adminUrl(b.slug) }));

  const cartas: Record<string, string> = {};
  for (const c of cards) cartas[c.restaurantId] = stableMenuSlugUrl(c.slug);

  return (
    <MiCuentaClient
      cards={cards}
      sinTarjeta={sinTarjeta}
      hoy={hoy}
      cartas={cartas}
      pricing={pricing}
      accountName={(profile?.full_name as string | null) ?? user.email ?? 'tu cuenta'}
      // Misma regla que aplica el servidor en createAnotherRestaurant: crea
      // quien tiene una identidad propia. Solo queda fuera la cuenta de PIN
      // del local, que es una credencial de turno, no una persona.
      canCreate={!isSyntheticStaffEmail(user.email)}
      grupo={scope?.isGroup
        ? { nombre: scope.name, enlace: scope.org ? subdomainUrl(scope.org.slug) : null }
        : null}
      accessMessage={acceso === 'sin-permiso'
        ? 'No tienes acceso a ese restaurante. Elige uno de tus restaurantes o pide al dueño que te invite.'
        : acceso === 'no-disponible'
          ? 'No pudimos abrir ese restaurante. Revisa la dirección o elige uno de tus restaurantes.'
          : null}
    />
  );
}
