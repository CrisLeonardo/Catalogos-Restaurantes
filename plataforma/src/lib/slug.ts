/* ============================================================
   SLUGS — generación y validación del subdominio del restaurante.
   Compartido entre el super admin y el registro self-serve para
   que ambos apliquen exactamente las mismas reglas.
   ============================================================ */

import { createServiceClient } from '@/lib/supabase/service';

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita acentos
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

// Subdominios reservados por la plataforma (no pueden ser de un restaurante).
export const RESERVED_SLUGS = [
  'demo', 'www', 'admin', 'api', 'app', 'super', 'preview', 'login',
  'central', 'registro', 'signup', 'cuenta', 'soporte', 'ayuda', 'blog',
];

/** Valida un slug de subdominio; devuelve mensaje de error o null si es válido. */
export function validateSlug(slug: string): string | null {
  if (slug.length < 3) {
    return 'La dirección debe tener al menos 3 caracteres.';
  }
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug)) {
    return 'La dirección solo puede tener minúsculas, números y guiones (sin espacios ni acentos).';
  }
  if (RESERVED_SLUGS.includes(slug)) {
    return `La dirección "${slug}" está reservada por la plataforma. Elige otra.`;
  }
  if (slug.endsWith('-admin') || slug.endsWith('-central')) {
    return 'La dirección no puede terminar en "-admin" ni "-central" (son subdominios reservados).';
  }
  return null;
}

/**
 * El subdominio es un namespace COMPARTIDO entre restaurantes y grupos.
 * Devuelve un mensaje si el slug ya lo usa la OTRA tabla, o null si está libre.
 */
export async function crossSlugCollision(
  db: ReturnType<typeof createServiceClient>,
  slug: string,
  table: 'restaurants' | 'organizations',
): Promise<string | null> {
  const other = table === 'restaurants' ? 'organizations' : 'restaurants';
  const { data } = await db.from(other).select('id').eq('slug', slug).maybeSingle();
  if (!data) return null;
  return other === 'organizations'
    ? `La dirección "${slug}" ya la usa un grupo. Elige otra.`
    : `La dirección "${slug}" ya la usa otra sucursal. Elige otra.`;
}

/** ¿El slug ya está tomado por un restaurante? */
export async function slugTaken(
  db: ReturnType<typeof createServiceClient>,
  slug: string,
): Promise<boolean> {
  const { data } = await db.from('restaurants').select('id').eq('slug', slug).maybeSingle();
  return !!data;
}

/** Genera un slug libre a partir de una base (base, base-2, base-3…). */
export async function uniqueSlug(
  db: ReturnType<typeof createServiceClient>,
  base: string,
): Promise<string> {
  let slug = base.slice(0, 56);
  if (!(await slugTaken(db, slug)) && !(await crossSlugCollision(db, slug, 'restaurants'))) {
    return slug;
  }
  for (let n = 2; n < 100; n++) {
    slug = `${base.slice(0, 52)}-${n}`;
    if (!(await slugTaken(db, slug)) && !(await crossSlugCollision(db, slug, 'restaurants'))) {
      return slug;
    }
  }
  return `${base.slice(0, 46)}-${Date.now().toString(36)}`;
}
