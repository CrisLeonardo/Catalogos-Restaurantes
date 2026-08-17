import { headers } from 'next/headers';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { DEMO_SLUG } from '@/lib/tenant';
import { getResumeSession } from '@/lib/auth/resume';
import { getAgentHubInfo } from '@/lib/print-agent';
import { isGoogleAuthEnabled } from '@/lib/auth-config';
import LoginClient from './login-client';

export default async function LoginPage({
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
      /* sin BD → muestra branding Leogin */
    }
  }

  let resume = null;
  try {
    resume = await getResumeSession();
  } catch {
    /* sin sesión utilizable → login normal */
  }

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
