import { headers } from 'next/headers';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { DEMO_SLUG } from '@/lib/tenant';
import LoginClient from './login-client';

export default async function LoginPage() {
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
      /* sin BD → muestra branding Leogin */
    }
  }

  return (
    <LoginClient restaurantName={restaurantName} logoUrl={logoUrl} slug={slug} />
  );
}
