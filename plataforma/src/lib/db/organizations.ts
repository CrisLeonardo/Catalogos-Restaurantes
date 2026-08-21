import 'server-only';

/* ============================================================
   ORGANIZACIONES (grupos) — alta automática
   ------------------------------------------------------------
   Un "grupo" ya no lo crea Leogin a mano: nace solo en cuanto una persona
   tiene dos restaurantes propios (ver createAnotherRestaurant y la acción
   del link único de pedidos). Esta es la pieza compartida por los dos
   caminos, para que la organización se arme SIEMPRE igual.

   Ojo con qué es hoy la organización y qué no:
    · SÍ es la marca del grupo (nombre y logo de los reportes consolidados)
      y el dueño del link único de pedidos, `grupo.dominio`, que reparte al
      cliente a la sucursal más cercana.
    · NO es lo que da acceso al panel consolidado. Eso lo dan las membresías
      de dueño (`getMyGroupScope`). Atarlo a esta fila era justamente el
      hueco viejo: sin ella —y solo Leogin la creaba— el dueño de tres
      locales no veía nada junto.
   ============================================================ */

import { createServiceClient } from '@/lib/supabase/service';
import { crossSlugCollision, slugify } from '@/lib/slug';

type Db = ReturnType<typeof createServiceClient>;

/**
 * Slug libre para un grupo nuevo (base, base-2, base-3…). El subdominio es
 * un namespace compartido con los restaurantes (ver crossSlugCollision), así
 * que hay que revisar las dos tablas, no solo `organizations`.
 */
export async function uniqueOrgSlug(db: Db, base: string): Promise<string> {
  const taken = async (s: string) => {
    const { data } = await db.from('organizations').select('id').eq('slug', s).maybeSingle();
    return !!data || !!(await crossSlugCollision(db, s, 'organizations'));
  };
  const root = base || 'grupo';
  let slug = root.slice(0, 56);
  if (!(await taken(slug))) return slug;
  for (let n = 2; n < 100; n++) {
    slug = `${root.slice(0, 52)}-${n}`;
    if (!(await taken(slug))) return slug;
  }
  return `${root.slice(0, 46)}-${Date.now().toString(36)}`;
}

/**
 * Devuelve la organización de esta persona, creándola si todavía no tiene.
 *
 * Es idempotente a propósito: si el perfil ya apunta a una, no crea nada y
 * solo engancha los restaurantes que faltaran. Así da igual quién llame
 * primero —el alta del segundo restaurante o el botón del link del grupo—
 * y un fallo puntual de red no deja a nadie sin grupo para siempre, que era
 * el defecto del intento anterior (si el insert fallaba, "se arregla a mano
 * después"… y ya no hay nadie que lo arregle a mano).
 *
 * Devuelve el id de la organización, o null si no se pudo crear.
 */
export async function ensureOwnerOrganization(opts: {
  userId: string;
  restaurantIds: string[];
  email?: string | null;
}): Promise<string | null> {
  const db = createServiceClient();

  const { data: profile } = await db
    .from('profiles')
    .select('organization_id, full_name')
    .eq('id', opts.userId)
    .maybeSingle();

  const fullName = (profile?.full_name as string | null) ?? null;
  let orgId = (profile?.organization_id as string | null) ?? null;

  if (!orgId) {
    const slug = await uniqueOrgSlug(db, slugify(fullName ?? 'grupo'));
    const { data: org } = await db
      .from('organizations')
      .insert({
        name: fullName ? `Restaurantes de ${fullName}` : 'Mis restaurantes',
        slug,
        contact_email: opts.email ?? null,
      })
      .select('id')
      .single();
    if (!org) return null;
    orgId = org.id as string;
    await db.from('profiles').update({ organization_id: orgId }).eq('id', opts.userId);
  }

  // Solo se enganchan los restaurantes que hoy no pertenecen a ningún grupo:
  // si uno ya está en otro, es una asignación deliberada y no se pisa.
  if (opts.restaurantIds.length > 0) {
    await db
      .from('restaurants')
      .update({ organization_id: orgId })
      .in('id', opts.restaurantIds)
      .is('organization_id', null);
  }

  return orgId;
}
