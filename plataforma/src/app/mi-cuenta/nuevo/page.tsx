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
export default async function NuevoRestaurantePage() {
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
        className="anim-fade-up"
        style={{ flex: 1, width: '100%', maxWidth: 640, margin: '0 auto', padding: '32px 18px 64px' }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--u-text-3)', marginBottom: 12 }}>
          {esElPrimero ? 'Tu primer restaurante' : 'Otro restaurante'}
        </div>
        <h1 className="t-display" style={{ fontSize: 'clamp(24px, 5vw, 32px)', lineHeight: 1.1, margin: '0 0 8px' }}>
          {esElPrimero ? 'Vamos a crear tu restaurante' : 'Crea otro restaurante'}
        </h1>
        <p className="t-mute" style={{ fontSize: 14, margin: '0 0 24px', lineHeight: 1.55 }}>
          Entrarás con esta misma cuenta, sin otro correo ni otra contraseña.
        </p>

        <Glass style={{ padding: '26px 24px' }}>
          <NuevoRestaurante
            rootDomain={rootDomainForUrls()}
            pricing={pricing}
            esElPrimero={esElPrimero}
          />
        </Glass>
      </div>
    </main>
  );
}
