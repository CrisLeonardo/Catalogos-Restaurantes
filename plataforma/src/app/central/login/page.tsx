import { headers } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/service';
import LoginClient from '@/app/login/login-client';

/* Login del panel de grupo (host slug-central.dominio → /central/login).
   Muestra la marca del grupo si el slug existe. */
export default async function CentralLoginPage() {
  const slug = (await headers()).get('x-org-slug');

  let orgName: string | null = null;
  let logoUrl: string | null = null;

  if (slug) {
    try {
      const db = createServiceClient();
      const { data } = await db.from('organizations').select('name, logo_url').eq('slug', slug).maybeSingle();
      if (data) {
        orgName = data.name as string;
        logoUrl = (data.logo_url as string | null) ?? null;
      }
    } catch { /* sin BD → marca Leogin */ }
  }

  // LoginClient usa `slug` para el ícono /api/icon/[slug]; aquí no aplica, así que
  // pasamos null y dejamos que use el logoUrl directo (o la marca Leogin).
  return <LoginClient restaurantName={orgName} logoUrl={logoUrl} slug={null} />;
}
