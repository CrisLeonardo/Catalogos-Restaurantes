import { headers } from 'next/headers';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { DEMO_SLUG } from '@/lib/tenant';
import LoginClient from '@/app/login/login-client';

/**
 * Página de login dentro del scope /admin/ de la PWA.
 * Misma UI que /login pero en una ruta dentro del scope del admin manifest,
 * lo que permite que la app admin standalone maneje la sesión sin salir de scope.
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

  return (
    <LoginClient restaurantName={restaurantName} logoUrl={logoUrl} slug={slug} />
  );
}
