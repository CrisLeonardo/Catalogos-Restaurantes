import { z } from 'zod';
import { isUnavailable, type AvailabilityFields } from '@/lib/product-availability';

/* ============================================================
   PORTADA DE LEOGIN: VITRINA Y «YA LO USAN»
   ------------------------------------------------------------
   La web de ventas enseñaba un teléfono con cuadros de color en vez
   de comida y ni un cliente real (auditoría 2026-10-02, WEB-02 y
   WEB-03). Las dos cosas dependen de algo que solo puede dar Leogin:
   el permiso de un restaurante para enseñar su menú y lo que dice de
   Leogin. Así que se configuran desde Super › Configuración › Portada
   y la portada las pinta con datos REALES del restaurante (nombre,
   logo, colores, sus platillos con foto y sus precios), no con una
   captura que se queda vieja.

   Se guardan en `platform_settings` (clave → texto, sin migración)
   como JSON. Este módulo es puro: lo usan el servidor de la portada,
   la acción del Super y las pruebas.
   ============================================================ */

export const LANDING_SHOWCASE_KEY = 'landing_showcase';
export const LANDING_TESTIMONIALS_KEY = 'landing_testimonials';

export const MAX_TESTIMONIALS = 3;
export const TESTIMONIAL_QUOTE_MAX = 280;
export const TESTIMONIAL_NAME_MAX = 60;
/** Platillos que caben en el teléfono de la portada sin apretarse. */
export const SHOWCASE_ITEMS = 4;

const UUID = z.string().guid();

export const testimonialSchema = z.object({
  restaurantId: UUID,
  quote: z.string().trim().min(1).max(TESTIMONIAL_QUOTE_MAX),
  person: z.string().trim().min(1).max(TESTIMONIAL_NAME_MAX),
  role: z.string().trim().max(TESTIMONIAL_NAME_MAX).default(''),
});

export type LandingTestimonial = z.infer<typeof testimonialSchema>;

export interface LandingSettings {
  /** Restaurante cuyo menú sale en el teléfono de la portada; null = ejemplo. */
  showcaseId: string | null;
  testimonials: LandingTestimonial[];
}

export const EMPTY_LANDING_SETTINGS: LandingSettings = { showcaseId: null, testimonials: [] };

function parseJson(raw: string | null | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Lee lo guardado. Un valor roto o a medias no tumba la portada: lo que
 * no pasa la validación se ignora y la portada sale como sin configurar.
 */
export function parseLandingSettings(map: Map<string, string>): LandingSettings {
  const showcase = parseJson(map.get(LANDING_SHOWCASE_KEY));
  const showcaseId =
    showcase && typeof showcase === 'object' && 'restaurantId' in showcase
      ? UUID.safeParse((showcase as { restaurantId: unknown }).restaurantId)
      : null;

  const rawList = parseJson(map.get(LANDING_TESTIMONIALS_KEY));
  const testimonials = Array.isArray(rawList)
    ? rawList
        .flatMap((t) => {
          const r = testimonialSchema.safeParse(t);
          return r.success ? [r.data] : [];
        })
        .slice(0, MAX_TESTIMONIALS)
    : [];

  return {
    showcaseId: showcaseId?.success ? showcaseId.data : null,
    testimonials,
  };
}

/** Lo que se escribe en `platform_settings`. */
export function serializeLandingSettings(s: LandingSettings): { key: string; value: string }[] {
  return [
    { key: LANDING_SHOWCASE_KEY, value: s.showcaseId ? JSON.stringify({ restaurantId: s.showcaseId }) : '' },
    { key: LANDING_TESTIMONIALS_KEY, value: s.testimonials.length ? JSON.stringify(s.testimonials) : '' },
  ];
}

type ShowcaseCandidate = AvailabilityFields & {
  id: string;
  category_id: string | null;
  image_url: string | null;
  sort_order?: number | null;
};

/**
 * Qué platillos salen en el teléfono: los que hoy se pueden pedir, con
 * foto primero (es lo que se vende), y entre ellos los más pedidos de
 * los últimos 30 días; luego el orden de la carta (categoría y platillo).
 */
export function pickShowcaseProducts<T extends ShowcaseCandidate>(
  products: T[],
  categoryOrder: string[],
  topSellerIds: string[] = [],
  n: number = SHOWCASE_ITEMS,
  now: number = Date.now(),
): T[] {
  const catRank = new Map(categoryOrder.map((id, i) => [id, i]));
  const topRank = new Map(topSellerIds.map((id, i) => [id, i]));
  const far = Number.MAX_SAFE_INTEGER;

  return products
    .filter((p) => !isUnavailable(p, now))
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      const photo = Number(!a.p.image_url) - Number(!b.p.image_url);
      if (photo) return photo;
      const top = (topRank.get(a.p.id) ?? far) - (topRank.get(b.p.id) ?? far);
      if (top) return top;
      const cat =
        (a.p.category_id ? catRank.get(a.p.category_id) ?? far : far) -
        (b.p.category_id ? catRank.get(b.p.category_id) ?? far : far);
      if (cat) return cat;
      return (a.p.sort_order ?? 0) - (b.p.sort_order ?? 0) || a.i - b.i;
    })
    .slice(0, n)
    .map(({ p }) => p);
}
