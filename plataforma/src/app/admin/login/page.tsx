import { headers } from 'next/headers';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { DEMO_SLUG } from '@/lib/tenant';
import { getResumeSession } from '@/lib/auth/resume';
import LoginClient from '@/app/login/login-client';

/**
 * Página de login dentro del scope /admin/ de la PWA.
 * Misma UI que /login pero en una ruta dentro del scope del admin manifest,
 * lo que permite que la app admin standalone maneje la sesión sin salir de scope.
 * Es también el LOGIN CENTRAL de Leogin Desktop (sin tenant): si ya hay una
 * sesión de personal viva en el dominio, ofrece "Continuar como {nombre}".
 */
export default async function AdminLoginPage() {
  const slug = (await headers()).get('x-tenant-slug');

  let restaurantName: string | null = null;
  let logoUrl: string | null = null;

  if (slug && slug !== DEMO_SLUG) {
    try {
      const data = await getRestaurantBySlug(slug);
      if (data) {
        restaurantName = data.restaurant.name;
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

  return (
    <LoginClient restaurantName={restaurantName} logoUrl={logoUrl} slug={slug} resume={resume} />
  );
}
