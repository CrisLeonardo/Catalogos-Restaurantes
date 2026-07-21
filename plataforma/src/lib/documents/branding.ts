/* ============================================================
   RESOLUCIÓN DE MARCA — documentos PDF/Excel (SOLO SERVIDOR)
   ------------------------------------------------------------
   Convierte el tema de un restaurante (resolveTheme) o los datos
   de una organización en un DocumentBranding normalizado. El logo
   NO se descarga aquí: solo se decide si existe, y se expone como
   una ruta same-origin (/api/doc-logo/...) que el cliente pedirá
   más tarde al dibujar el PDF (evita CORS y evita gastar un fetch
   de imagen en cada export que ni siquiera dibuja un logo, como
   los de Excel).
   ============================================================ */

import { createServiceClient } from '@/lib/supabase/service';
import { resolveTheme, hexToRgb, isLight, type ThemeRow } from '@/lib/theme/resolve';
import { LEOGIN_INK } from './types';
import type { DocumentBranding } from './types';
import type { Organization } from '@/types';

function contrastInk(accentHex: string): string {
  return isLight(accentHex) ? LEOGIN_INK : '#FFFFFF';
}

/** Marca de un restaurante para sus propios documentos (Finanzas, Pedidos, Clientes, Productos, Arqueo). */
export async function resolveRestaurantBranding(restaurantId: string): Promise<DocumentBranding> {
  const db = createServiceClient();
  const [{ data: restaurant }, { data: themeRow }] = await Promise.all([
    db.from('restaurants').select('name, tagline, slug').eq('id', restaurantId).maybeSingle(),
    db.from('restaurant_themes').select('*').eq('restaurant_id', restaurantId).maybeSingle(),
  ]);

  const slug = (restaurant?.slug as string | undefined) ?? undefined;
  const { config } = resolveTheme((themeRow as ThemeRow) ?? null, slug, {
    brandName: (restaurant?.name as string | undefined) ?? undefined,
    tagline: (restaurant?.tagline as string | null | undefined) ?? undefined,
  });

  return {
    kind: 'restaurant',
    name: config.brandName,
    subtitle: (restaurant?.tagline as string | null) ?? null,
    accentHex: config.colorAccent,
    accentRgb: hexToRgb(config.colorAccent),
    onAccentHex: contrastInk(config.colorAccent),
    logoUrl: config.logoUrl ? `/api/doc-logo/restaurant/${restaurantId}` : null,
    currencySymbol: config.currencySymbol,
    currencyPosition: config.currencyPosition,
    locale: config.locale,
  };
}

/**
 * Marca de una organización para el reporte de grupo/franquicia. La moneda no
 * vive en `organizations` (ni en el reporte de grupo): se recibe resuelta de
 * antemano (normalmente la de la primera sucursal) — supuesto documentado de
 * "un grupo, una sola moneda", ver plan.
 */
export async function resolveOrganizationBranding(
  org: Organization,
  fallbackCurrency: { symbol: string; position: 'prefix' | 'suffix'; locale: string },
): Promise<DocumentBranding> {
  return {
    kind: 'organization',
    name: org.name,
    subtitle: null,
    accentHex: org.color_primary,
    accentRgb: hexToRgb(org.color_primary),
    onAccentHex: contrastInk(org.color_primary),
    logoUrl: org.logo_url ? `/api/doc-logo/organization/${org.id}` : null,
    currencySymbol: fallbackCurrency.symbol,
    currencyPosition: fallbackCurrency.position,
    locale: fallbackCurrency.locale,
  };
}
