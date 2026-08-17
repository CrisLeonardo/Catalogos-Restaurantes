import { headers } from 'next/headers';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { DEMO_SLUG } from '@/lib/tenant';
import { getResumeSession } from '@/lib/auth/resume';
import { getAgentHubInfo } from '@/lib/print-agent';
import { isGoogleAuthEnabled } from '@/lib/auth-config';
import LoginClient from '@/app/login/login-client';

/**
 * Página de login dentro del scope /admin/ de la PWA.
 * Misma UI que /login pero en una ruta dentro del scope del admin manifest,
 * lo que permite que la app admin standalone maneje la sesión sin salir de scope.
 * Es también el LOGIN CENTRAL de Leogin Desktop (sin tenant): si ya hay una
 * sesión de personal viva en el dominio, ofrece "Continuar como {nombre}".
 */
/* Sin metadata propia, esta pantalla heredaba el título del menú público del
   tenant y la pestaña del navegador decía "Menú en línea" mientras el dueño
   estaba escribiendo su contraseña. */
export const metadata = {
  title: 'Acceso al panel — Leogin',
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ auth_error?: string }>;
}) {
  const slug = (await headers()).get('x-tenant-slug');
  const authError = (await searchParams).auth_error === '1';

  let restaurantName: string | null = null;
  let restaurantId: string | null = null;
  let logoUrl: string | null = null;

  if (slug && slug !== DEMO_SLUG) {
    try {
      const data = await getRestaurantBySlug(slug);
      if (data) {
        restaurantName = data.restaurant.name;
        restaurantId = data.restaurant.id;
        logoUrl = data.resolved.config.pwaIconUrl ?? data.resolved.config.logoUrl ?? null;
      }
    } catch {
      /* sin BD → branding Leogin */
    }
  }

  let resume = null;
  try {
    resume = await getResumeSession();
  } catch {
    /* sin sesión utilizable → login normal */
  }

  // Fallback del hub local (Fase 2 offline): si el PIN falla por conectividad
  // intermitente justo al enviarlo, staff-pin-login.tsx reintenta contra el
  // hub con esto — nunca abre sesión por sí solo, solo identifica al operador.
  let hubUrl: string | null = null;
  let hubToken: string | null = null;
  if (restaurantId) {
    try {
      const hub = await getAgentHubInfo(restaurantId);
      hubUrl = hub.hubUrl;
      hubToken = hub.hubToken;
    } catch {
      /* sin agente vinculado → sin fallback offline */
    }
  }

  return (
    <LoginClient
      restaurantName={restaurantName}
      restaurantId={restaurantId}
      logoUrl={logoUrl}
      slug={slug}
      resume={resume}
      hubUrl={hubUrl}
      hubToken={hubToken}
      googleEnabled={isGoogleAuthEnabled()}
      authError={authError}
    />
  );
}
