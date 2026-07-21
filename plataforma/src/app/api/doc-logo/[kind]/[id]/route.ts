import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveTheme, type ThemeRow } from '@/lib/theme/resolve';
import { isAllowedAssetUrl } from '@/lib/asset-url';

const ALLOWED_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/**
 * Proxy same-origin del logo de un restaurante u organización, para usarlo
 * dentro de un PDF de marca (jsPDF corre en el navegador: sin este proxy,
 * cargar el logo real de Supabase Storage desde el cliente chocaría con
 * CORS). A diferencia de /api/icon/[slug] (que SIEMPRE responde con algún
 * ícono, cayendo al de Leogin si falta), aquí un logo ausente/no permitido
 * es un 404 real — un documento de marca del restaurante nunca debe mostrar
 * el logo de Leogin como si fuera el del restaurante.
 *
 * GET /api/doc-logo/restaurant/[restaurantId]
 * GET /api/doc-logo/organization/[organizationId]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const { kind, id } = await params;
  if (kind !== 'restaurant' && kind !== 'organization') {
    return new Response(null, { status: 404 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return new Response(null, { status: 404 });
  }

  const db = createServiceClient();
  let logoUrl: string | null = null;

  if (kind === 'restaurant') {
    const [{ data: restaurant }, { data: themeRow }] = await Promise.all([
      db.from('restaurants').select('name, tagline, slug').eq('id', id).maybeSingle(),
      db.from('restaurant_themes').select('*').eq('restaurant_id', id).maybeSingle(),
    ]);
    if (!restaurant) return new Response(null, { status: 404 });
    const { config } = resolveTheme((themeRow as ThemeRow) ?? null, restaurant.slug as string, {
      brandName: (restaurant.name as string) ?? undefined,
      tagline: (restaurant.tagline as string | null) ?? undefined,
    });
    logoUrl = config.logoUrl;
  } else {
    const { data: org } = await db.from('organizations').select('logo_url').eq('id', id).maybeSingle();
    logoUrl = (org?.logo_url as string | null) ?? null;
  }

  if (!logoUrl || !isAllowedAssetUrl(logoUrl)) {
    return new Response(null, { status: 404 });
  }

  try {
    const res = await fetch(logoUrl, { signal: AbortSignal.timeout(8000) });
    if (!res.ok || !res.body) return new Response(null, { status: 404 });

    const contentType = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!ALLOWED_MIMES.includes(contentType)) return new Response(null, { status: 404 });

    return new Response(res.body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
