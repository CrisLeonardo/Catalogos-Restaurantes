import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveTheme, type ResolvedTheme } from '@/lib/theme/resolve';
import type { Restaurant, RestaurantTheme } from '@/types';
import { modulosAlCambiarDePlan, validPlanCode } from '@/lib/plans';

/* ── Suspendido por impago: la carta sigue, sin pedidos ─────────
   Decisión del dueño (2026-11-23, auditoría de lanzamiento LZ-08): el QR
   impreso en las mesas no puede dar «Restaurante no encontrado» porque el
   local se atrasó con su mensualidad. Mientras dure la suspensión POR
   IMPAGO la carta se ve como Básico: sin pedidos ni módulos que interactúan.
   El servidor ya rechaza pedidos de un local que no está activo
   (actions/orders.ts). La suspensión manual (abuso, riesgo) sí la quita. */
export function soloCartaPorImpago(restaurant: Restaurant): Restaurant {
  const plan = validPlanCode(restaurant.plan_actual);
  return {
    ...restaurant,
    modules: modulosAlCambiarDePlan(plan, 'BASICO', (restaurant.modules as Record<string, boolean> | null) ?? {}),
  } as Restaurant;
}

/** ¿Esta fila de `restaurants` (con su cobro embebido) se puede mostrar? */
function estadoPublico(fila: { status: string; restaurant_billing?: unknown }): 'activa' | 'solo-carta' | 'oculta' {
  if (fila.status === 'active') return 'activa';
  const cobro = Array.isArray(fila.restaurant_billing) ? fila.restaurant_billing[0] : fila.restaurant_billing;
  const porImpago = (cobro as { suspended_for_nonpayment?: boolean } | null)?.suspended_for_nonpayment === true;
  return fila.status === 'suspended' && porImpago ? 'solo-carta' : 'oculta';
}

export type RestaurantWithTheme = {
  restaurant: Restaurant;
  theme: RestaurantTheme;
  /** Tema ya resuelto (defaults ← legacy ← config ← override por código). */
  resolved: ResolvedTheme;
};

/**
 * Resuelve un slug de subdominio a su restaurante + tema.
 * Cached por request: se llama desde layout y page sin doble query a Supabase.
 * Devuelve null si Supabase no está configurado o el restaurante no existe.
 */
export const getRestaurantBySlug = cache(
  async (slug: string): Promise<RestaurantWithTheme | null> => {
    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ) {
      return null;
    }

    const supabase = await createClient();

    /* Restaurante y tema en UNA consulta (el tema cuelga del restaurante por
       su clave primaria, así que PostgREST lo incrusta). Antes eran dos en
       fila, y esto corre en cada pantalla del panel. */
    let { data: row, error } = await supabase
      .from('restaurants')
      .select('*, restaurant_themes(*)')
      .eq('slug', slug)
      .eq('status', 'active')
      .single();

    /* PGRST116 = no hay filas: el restaurante de verdad no existe. Cualquier
       otro error —en la práctica, un token de sesión que el servidor no logró
       refrescar a tiempo en esta petición— NO es «no existe»: el candado del
       panel lo tomaba así y te mandaba a Platillos (o al login) con la sesión
       viva, de vez en cuando (auditoría 2026-10-02, N-10/REN-10). Se repite
       con la llave de servicio: esta fila la puede leer cualquiera
       (`restaurants_select_active`, la usa el menú público), así que no se
       da acceso a nada nuevo. */
    if (error && error.code !== 'PGRST116') {
      const retry = await createServiceClient()
        .from('restaurants')
        .select('*, restaurant_themes(*)')
        .eq('slug', slug)
        .eq('status', 'active')
        .single();
      row = retry.data;
      error = retry.error;
    }

    if (error || !row) return null;

    const { restaurant_themes: embedded, ...restaurant } = row as Record<string, unknown> & { id: string };
    const theme = (Array.isArray(embedded) ? embedded[0] : embedded) as RestaurantTheme | null | undefined;
    const themeRow = theme ?? defaultTheme(restaurant.id);

    return {
      restaurant: restaurant as unknown as Restaurant,
      theme: themeRow,
      resolved: resolveTheme(themeRow, slug, {
        brandName: restaurant.name as string,
        tagline: restaurant.tagline as string | null,
      }),
    };
  }
);

/**
 * Resuelve un restaurant id → { slug, status }, sin traer el theme.
 * Usado por el redirector estable de mesas/QR (src/app/m/[restaurantId]/…):
 * el link impreso en la mesa nunca cambia, pero el slug al que apunta sí
 * puede cambiar con el tiempo — esta consulta siempre trae el slug VIGENTE.
 * Cached por request igual que getRestaurantBySlug.
 */
export const getRestaurantSlugById = cache(
  async (restaurantId: string): Promise<{ slug: string; status: Restaurant['status'] } | null> => {
    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ) {
      return null;
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from('restaurants')
      .select('slug, status')
      .eq('id', restaurantId)
      .single();

    if (error || !data) return null;
    return data as { slug: string; status: Restaurant['status'] };
  }
);

/**
 * Variante cacheada ENTRE requests de getRestaurantBySlug, para las
 * superficies PÚBLICAS del tenant: el menú (src/app/page.tsx) y el layout
 * raíz (que solo necesita el tema para pintar colores/fuentes/fondo). El
 * panel de personal sigue usando getRestaurantBySlug: ahí manda la sesión
 * del usuario y el estado siempre al día.
 *
 * Dos niveles a propósito:
 *  1. slug → id, EN VIVO (no cacheado): lookup barato e indexado que además
 *     exige status='active'. Así una suspensión (Super Admin) se refleja de
 *     inmediato aunque la fila de abajo siga cacheada.
 *  2. fila completa (restaurant + theme) por id, cacheada 60s y con tag
 *     `restaurant:${id}` — se invalida con updateTag() en toda acción que
 *     edite el restaurante o su tema (ver actions/restaurant.ts,
 *     actions/modules.ts), así que el dueño no espera los 60s.
 *
 * Envuelto en React.cache: el layout raíz la llama desde generateMetadata,
 * generateViewport y el propio componente. Sin esto, el lookup slug→id del
 * nivel 1 (que es en vivo a propósito) se pagaría tres veces por request.
 */
export const getRestaurantBySlugCached = cache(
  async (slug: string): Promise<RestaurantWithTheme | null> => {
    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ) {
      return null;
    }

    const liveDb = createServiceClient();
    const { data: idRow } = await liveDb
      .from('restaurants')
      .select('id, status, restaurant_billing(suspended_for_nonpayment)')
      .eq('slug', slug)
      .in('status', ['active', 'suspended'])
      .single();

    if (!idRow) return null;
    const estado = estadoPublico(idRow as { status: string; restaurant_billing?: unknown });
    if (estado === 'oculta') return null;

    const row = await fetchRestaurantByIdCached(idRow.id as string);
    if (!row) return null;

    const themeRow = row.theme ?? defaultTheme(row.restaurant.id);
    return {
      restaurant: estado === 'solo-carta' ? soloCartaPorImpago(row.restaurant) : row.restaurant,
      theme: themeRow,
      resolved: resolveTheme(themeRow, slug, {
        brandName: row.restaurant.name,
        tagline: row.restaurant.tagline,
      }),
    };
  }
);

/**
 * Igual que getRestaurantBySlugCached, pero por id. Para la portada de
 * Leogin, que enseña el menú de un restaurante elegido en el Super
 * (vitrina y testimonios, WEB-02/03): el id no cambia aunque cambie el
 * slug. Mismos dos niveles: «sigue activo» en vivo, la fila cacheada.
 */
export const getRestaurantByIdCached = cache(
  async (restaurantId: string): Promise<RestaurantWithTheme | null> => {
    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      !/^[0-9a-f-]{36}$/i.test(restaurantId)
    ) {
      return null;
    }

    const { data: live } = await createServiceClient()
      .from('restaurants')
      .select('slug')
      .eq('id', restaurantId)
      .eq('status', 'active')
      .maybeSingle();
    if (!live) return null;

    const row = await fetchRestaurantByIdCached(restaurantId);
    if (!row) return null;

    const slug = live.slug as string;
    const themeRow = row.theme ?? defaultTheme(row.restaurant.id);
    return {
      restaurant: row.restaurant,
      theme: themeRow,
      resolved: resolveTheme(themeRow, slug, {
        brandName: row.restaurant.name,
        tagline: row.restaurant.tagline,
      }),
    };
  }
);

function fetchRestaurantByIdCached(restaurantId: string) {
  return unstable_cache(
    async (): Promise<{ restaurant: Restaurant; theme: RestaurantTheme | null } | null> => {
      const db = createServiceClient();
      const { data: restaurant } = await db.from('restaurants').select('*').eq('id', restaurantId).single();
      if (!restaurant) return null;

      const { data: theme } = await db
        .from('restaurant_themes')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .single();

      return { restaurant: restaurant as Restaurant, theme: (theme as RestaurantTheme) ?? null };
    },
    ['public-restaurant-by-id', restaurantId],
    { revalidate: 60, tags: [`restaurant:${restaurantId}`] },
  )();
}

function defaultTheme(restaurantId: string): RestaurantTheme {
  return {
    restaurant_id: restaurantId,
    brand_name: null,
    logo_url: null,
    color_primary: '#D97757',
    color_bg: '#0b0b0c',
    color_text: '#F5F3EF',
    font_display: 'Unbounded',
    portada_style: 'spotlight',
    catalog_view: 'grid',
    glass_intensity: 'translucido',
    background_image: null,
    config: null,
    content: null,
    custom_css: null,
  };
}
