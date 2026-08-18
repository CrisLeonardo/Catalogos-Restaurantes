import type { Metadata } from 'next';
import Link from 'next/link';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import LeoginLogo from '@/components/leogin-logo';
import { rootDomainForUrls, adminUrl } from '@/lib/tenant';
import { getEffectivePlanPricing } from '@/lib/db/billing';
import { isGoogleAuthEnabled } from '@/lib/auth-config';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import SignupWizard from './signup-wizard';

export const metadata: Metadata = {
  title: 'Crea tu restaurante — Leogin',
  description: 'Crea tu menú digital con pedidos en línea en minutos. 1 mes de prueba gratis, sin tarjeta.',
  robots: { index: true, follow: true },
};

const perks = (trialDays: number) => [
  { icon: 'bag', text: 'Menú web por QR, rápido y a tu marca' },
  { icon: 'list', text: 'Pedidos en línea con alerta en tiempo real' },
  { icon: 'sparkle', text: 'Personalización total: colores, logo y estilo' },
  { icon: 'wallet', text: `${trialDays} días gratis · sin tarjeta · cancela cuando quieras` },
];

/* Esta página ya no se puede pre-renderizar: mira la sesión del visitante para
   saber si vuelve de Google (y con qué cuenta). Los precios siguen saliendo de
   /super/configuracion, ahora leídos en cada visita — un registro al día no
   justifica cachear, y así un cambio de precio se ve al instante. */
export const dynamic = 'force-dynamic';

/**
 * Cuenta de personal ya autenticada en este navegador, si la hay.
 *
 * Dos casos muy distintos:
 *  · `hasProfile: false` → cuenta de Google recién creada que todavía no
 *    administra ningún restaurante: es exactamente quien está a mitad del
 *    registro con Google. El wizard salta el paso de la contraseña.
 *  · `hasProfile: true`  → esa cuenta YA administra un restaurante. Hoy una
 *    cuenta = un restaurante, así que no puede crear otro con ella misma; se
 *    le avisa y se le ofrece su panel (ver PLAN_ACCESO_MULTICUENTA.md para el
 *    modelo de varias sucursales bajo una sola cuenta).
 */
async function currentStaffAccount(): Promise<{
  email: string;
  fullName: string | null;
  hasProfile: boolean;
  restaurantName: string | null;
  panelUrl: string | null;
} | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return null;

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, restaurant_id')
      .eq('id', user.id)
      .maybeSingle();

    const meta = user.user_metadata as { full_name?: string; name?: string } | null;
    const fullName =
      (profile?.full_name as string | null) ?? meta?.full_name ?? meta?.name ?? null;

    if (!profile) {
      return { email: user.email, fullName, hasProfile: false, restaurantName: null, panelUrl: null };
    }

    let restaurantName: string | null = null;
    let panelUrl: string | null = null;
    if (profile.restaurant_id) {
      // Cliente de servicio: el menú público solo deja leer restaurantes
      // activos, y aquí hace falta el nombre aunque esté pausado.
      const db = createServiceClient();
      const { data: rest } = await db
        .from('restaurants')
        .select('name, slug')
        .eq('id', profile.restaurant_id as string)
        .maybeSingle();
      restaurantName = (rest?.name as string | null) ?? null;
      panelUrl = rest?.slug ? `${adminUrl(rest.slug as string)}/menu` : null;
    }
    return { email: user.email, fullName, hasProfile: true, restaurantName, panelUrl };
  } catch {
    return null; // sin BD → registro normal
  }
}

export default async function RegistroPage({
  searchParams,
}: {
  searchParams: Promise<{ auth_error?: string }>;
}) {
  const rootDomain = rootDomainForUrls();
  const [pricing, account, params] = await Promise.all([
    getEffectivePlanPricing(),
    currentStaffAccount(),
    searchParams,
  ]);

  const googleAccount =
    account && !account.hasProfile ? { email: account.email, fullName: account.fullName } : null;
  const existingAccount =
    account && account.hasProfile
      ? { email: account.email, restaurantName: account.restaurantName, panelUrl: account.panelUrl }
      : null;

  return (
    <main style={{ minHeight: '100svh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header
        className="glass-solid"
        style={{
          position: 'sticky', top: 0, zIndex: 50,
          borderRadius: 0, borderLeft: 'none', borderRight: 'none', borderTop: 'none',
          height: 56, padding: '0 18px', display: 'flex', alignItems: 'center',
        }}
      >
        <Link href="/" style={{ textDecoration: 'none' }}><LeoginLogo size={26} /></Link>
      </header>

      <div
        className="anim-fade-up"
        style={{
          flex: 1, width: '100%', maxWidth: 980, margin: '0 auto',
          display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 28,
          padding: '32px 18px 64px', alignItems: 'start',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 28, alignItems: 'start' }}>
          {/* Lado izquierdo: promesa */}
          <div style={{ paddingTop: 8 }}>
            <div className="t-kicker" style={{ fontSize: 11, marginBottom: 14 }}>Crea tu restaurante</div>
            <h1 className="t-display" style={{ fontSize: 'var(--fs-display)', lineHeight: 1.05 }}>
              Tu menú en línea, en vivo hoy mismo.
            </h1>
            <p className="t-mute" style={{ fontSize: 15, lineHeight: 1.55, marginTop: 14, maxWidth: 420 }}>
              Regístrate, personaliza y comparte. Sin instalar nada, sin saber de tecnología.
              Te guiamos paso a paso.
            </p>
            <ul style={{ listStyle: 'none', margin: '22px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {perks(pricing.trialDays).map((p) => (
                <li key={p.text} style={{ display: 'flex', gap: 11, alignItems: 'center', fontSize: 14 }}>
                  <span style={{ width: 32, height: 32, borderRadius: 9, flexShrink: 0, display: 'grid', placeItems: 'center', background: 'rgba(var(--brand-accent-rgb, 99,102,241),0.12)', color: 'var(--brand-accent-ink)' }}>
                    <Icon name={p.icon} size={16} />
                  </span>
                  <span style={{ color: 'var(--u-text-2)' }}>{p.text}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Lado derecho: wizard */}
          <Glass style={{ padding: '26px 24px' }}>
            <SignupWizard
              rootDomain={rootDomain}
              pricing={pricing}
              googleEnabled={isGoogleAuthEnabled()}
              googleAccount={googleAccount}
              existingAccount={existingAccount}
              authError={params.auth_error === '1'}
            />
          </Glass>
        </div>
      </div>
    </main>
  );
}
