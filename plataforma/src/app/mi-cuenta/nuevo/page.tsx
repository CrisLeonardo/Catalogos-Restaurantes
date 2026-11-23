import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Glass } from '@/components/glass';
import LeoginLogo from '@/components/leogin-logo';
import { createClient } from '@/lib/supabase/server';
import { getMyMemberships, canBill } from '@/lib/db/membership';
import { getEffectivePlanPricing } from '@/lib/db/billing';
import { isSyntheticStaffEmail } from '@/lib/staff-email';
import { rootDomainForUrls } from '@/lib/tenant';
import { leerIntencion } from '@/lib/alta';
import NuevoRestaurante from './nuevo-restaurante';

export const metadata: Metadata = {
  title: 'Crear un restaurante — Leogin',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * CREAR UN RESTAURANTE — el único sitio donde nace uno.
 *
 * Es donde terminan los dos caminos: quien acaba de registrarse y todavía no
 * tiene ninguno, y quien ya tiene tres y abre el cuarto. Antes el primero se
 * creaba en `/registro` (junto con la cuenta) y los demás en un diálogo de Mi
 * cuenta, y las dos formas se fueron separando solas.
 *
 * El candado es el mismo que aplica la acción del servidor: crea quien tiene
 * una identidad propia, no la cuenta de PIN del local.
 */
export default async function NuevoRestaurantePage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; caso?: string }>;
}) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    redirect('/');
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/admin/login');

  // La credencial de turno del local no abre negocios. Mismo motivo y mismo
  // texto que en createAnotherRestaurant: aquí solo se evita enseñar una
  // pantalla que iba a terminar en un rechazo.
  if (isSyntheticStaffEmail(user.email)) redirect('/mi-cuenta');

  const [memberships, pricing] = await Promise.all([
    getMyMemberships(),
    getEffectivePlanPricing(),
  ]);
  const esElPrimero = !memberships.some((m) => canBill(m.role));

  /* Lo que eligió en la web (LZ-11): primero el enlace; si no, lo que quedó
     guardado en su cuenta al registrarse — así sobrevive aunque vuelva otro
     día desde otro aparato. Lo guardado solo vale para su primer local. */
  const params = await searchParams;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const intencion = leerIntencion(params.plan, params.caso)
    ?? (esElPrimero ? leerIntencion(meta.alta_plan, meta.alta_caso) : null);

  return (
    <main style={{ minHeight: '100svh', display: 'flex', flexDirection: 'column' }}>
      <header
        className="glass-solid"
        style={{
          position: 'sticky', top: 0, zIndex: 50,
          borderRadius: 0, borderLeft: 'none', borderRight: 'none', borderTop: 'none',
          height: 56, padding: '0 18px', display: 'flex', alignItems: 'center', gap: 12,
        }}
      >
        <Link href="/mi-cuenta" style={{ textDecoration: 'none' }}><LeoginLogo size={26} /></Link>
        <span style={{ fontSize: 13, color: 'var(--u-text-3)' }}>{user.email}</span>
      </header>

      <div
        className="anim-fade-up alta-pagina"
      >
        {/* Ficha 2.3: sin título encima. Cada paso dice lo suyo; al segundo
            restaurante se le recuerda en una línea que es la misma cuenta. */}
        {!esElPrimero && (
          <p className="t-mute" style={{ fontSize: 14, margin: '0 0 16px', lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--u-text)' }}>Otro restaurante</strong> · entrarás con esta misma cuenta.
          </p>
        )}

        <Glass style={{ padding: '22px 20px' }}>
          <NuevoRestaurante
            rootDomain={rootDomainForUrls()}
            pricing={pricing}
            esElPrimero={esElPrimero}
            intencion={intencion}
          />
        </Glass>
      </div>
    </main>
  );
}
