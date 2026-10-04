'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { verifySuperAdmin } from '@/lib/auth/super-admin-guard';
import { LANDING_CONTENT_TAG } from '@/lib/db/landing';
import {
  MAX_TESTIMONIALS,
  TESTIMONIAL_NAME_MAX,
  TESTIMONIAL_QUOTE_MAX,
  serializeLandingSettings,
  type LandingTestimonial,
} from '@/lib/landing-content';

/* ============================================================
   GUARDAR LA VITRINA Y LOS TESTIMONIOS DE LA PORTADA (WEB-02/03)
   ------------------------------------------------------------
   Lo que se guarda aquí sale en la web de ventas de Leogin con el
   nombre, el logo y el menú de un restaurante real. Por eso cada uno
   exige que el Super marque que tiene su permiso: no se guarda en la
   base (no hay a quién enseñárselo), pero obliga a pensarlo antes.
   ============================================================ */

export type LandingSaveState = { saved: true } | { error: string } | null;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Payload {
  showcaseId: string | null;
  showcasePermiso: boolean;
  testimonials: (LandingTestimonial & { permiso: boolean })[];
}

function leerPayload(raw: FormDataEntryValue | null): Payload | null {
  try {
    const p = JSON.parse(String(raw ?? '')) as Partial<Payload>;
    if (!p || typeof p !== 'object' || !Array.isArray(p.testimonials)) return null;
    return {
      showcaseId: typeof p.showcaseId === 'string' && p.showcaseId ? p.showcaseId : null,
      showcasePermiso: p.showcasePermiso === true,
      testimonials: p.testimonials.map((t) => ({
        restaurantId: String(t?.restaurantId ?? ''),
        quote: String(t?.quote ?? '').trim(),
        person: String(t?.person ?? '').trim(),
        role: String(t?.role ?? '').trim(),
        permiso: t?.permiso === true,
      })),
    };
  } catch {
    return null;
  }
}

export async function saveLandingContent(
  _prev: LandingSaveState,
  formData: FormData,
): Promise<LandingSaveState> {
  const db = await verifySuperAdmin();
  if (!db) return { error: 'No autorizado.' };

  const p = leerPayload(formData.get('payload'));
  if (!p) return { error: 'No se pudo leer el formulario. Recarga la página e inténtalo otra vez.' };

  if (p.showcaseId) {
    if (!UUID.test(p.showcaseId)) return { error: 'El restaurante de la vitrina no es válido.' };
    if (!p.showcasePermiso) return { error: 'Marca que tienes permiso del restaurante para enseñar su menú en la portada.' };
  }

  if (p.testimonials.length > MAX_TESTIMONIALS) {
    return { error: `Caben ${MAX_TESTIMONIALS} testimonios como máximo.` };
  }
  for (const [i, t] of p.testimonials.entries()) {
    const n = `Testimonio ${i + 1}`;
    if (!UUID.test(t.restaurantId)) return { error: `${n}: elige el restaurante.` };
    if (!t.quote) return { error: `${n}: falta lo que dijo.` };
    if (t.quote.length > TESTIMONIAL_QUOTE_MAX) return { error: `${n}: la frase pasa de ${TESTIMONIAL_QUOTE_MAX} caracteres.` };
    if (!t.person) return { error: `${n}: falta el nombre de quien lo dice.` };
    if (t.person.length > TESTIMONIAL_NAME_MAX || t.role.length > TESTIMONIAL_NAME_MAX) {
      return { error: `${n}: el nombre o el cargo pasan de ${TESTIMONIAL_NAME_MAX} caracteres.` };
    }
    if (!t.permiso) return { error: `${n}: marca que tienes su permiso para publicarlo.` };
  }

  // Solo restaurantes activos: uno suspendido no se puede presumir.
  const ids = [...new Set([p.showcaseId, ...p.testimonials.map((t) => t.restaurantId)].filter(Boolean))] as string[];
  if (ids.length) {
    const { data, error } = await db.from('restaurants').select('id').in('id', ids).eq('status', 'active');
    if (error) return { error: 'No se pudieron comprobar los restaurantes. Inténtalo otra vez.' };
    if ((data ?? []).length !== ids.length) return { error: 'Uno de los restaurantes elegidos ya no está activo.' };
  }

  const rows = serializeLandingSettings({
    showcaseId: p.showcaseId,
    testimonials: p.testimonials.map(({ restaurantId, quote, person, role }) => ({ restaurantId, quote, person, role })),
  });
  const { error } = await db.from('platform_settings').upsert(rows, { onConflict: 'key' });
  if (error) return { error: 'No se pudo guardar. Inténtalo otra vez.' };

  updateTag(LANDING_CONTENT_TAG);
  revalidatePath('/super/configuracion/portada');
  revalidatePath('/');
  return { saved: true };
}
