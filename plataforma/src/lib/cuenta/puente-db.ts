import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';
import { faltaLaTabla } from '@/lib/db/migracion-ausente';
import { vueltaSegura } from './puente';
import { hashCodigo, nuevoCodigo } from './puente-codigo';

/* ============================================================
   El puente de sesión, contra la base (migración 146).
   Todo con el cliente de servicio: las dos tablas no tienen
   políticas, y cada función recibe el `auth_user_id` YA validado
   por quien la llama (la sesión de la billetera), nunca de la URL.
   ============================================================ */

export interface RestauranteDelPuente {
  id: string;
  slug: string;
  nombre: string;
  logoUrl: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** El restaurante al que se quiere entrar (por slug o por id), si existe y está activo. */
export async function restauranteParaPuente(ref: string): Promise<RestauranteDelPuente | null> {
  const columna = UUID_RE.test(ref) ? 'id' : SLUG_RE.test(ref) ? 'slug' : null;
  if (!columna) return null;
  const db = createServiceClient();
  const { data } = await db
    .from('restaurants')
    .select('id, slug, name, status, restaurant_themes(brand_name, logo_url)')
    .eq(columna, ref)
    .maybeSingle();
  if (!data || data.status !== 'active') return null;
  const tema = (Array.isArray(data.restaurant_themes) ? data.restaurant_themes[0] : data.restaurant_themes) as
    | { brand_name: string | null; logo_url: string | null }
    | null
    | undefined;
  return {
    id: data.id as string,
    slug: data.slug as string,
    nombre: tema?.brand_name || (data.name as string),
    logoUrl: tema?.logo_url ?? null,
  };
}

/** ¿Esta cuenta ya se unió a este restaurante? (entonces no se vuelve a preguntar) */
export async function yaSeUnio(authUserId: string, restaurantId: string): Promise<boolean> {
  const db = createServiceClient();
  const { count, error } = await db
    .from('cuenta_restaurantes')
    .select('restaurant_id', { count: 'exact', head: true })
    .eq('auth_user_id', authUserId)
    .eq('restaurant_id', restaurantId);
  if (error && !faltaLaTabla(error)) console.error('[puente] yaSeUnio:', error.message);
  return (count ?? 0) > 0;
}

/** El comensal aceptó unirse: queda el permiso (idempotente). */
export async function unirse(authUserId: string, restaurantId: string): Promise<boolean> {
  const db = createServiceClient();
  const { error } = await db
    .from('cuenta_restaurantes')
    .upsert({ auth_user_id: authUserId, restaurant_id: restaurantId }, { onConflict: 'auth_user_id,restaurant_id', ignoreDuplicates: true });
  if (error) {
    console.error('[puente] unirse:', error.message);
    return false;
  }
  return true;
}

/** Crea un código de un solo uso para entrar a ESTE restaurante. Devuelve el código en claro. */
export async function crearPuente(authUserId: string, restaurantId: string, vuelta: string): Promise<string | null> {
  const codigo = nuevoCodigo();
  const db = createServiceClient();
  const { error } = await db.from('cuenta_puentes').insert({
    codigo_hash: hashCodigo(codigo),
    auth_user_id: authUserId,
    restaurant_id: restaurantId,
    vuelta: vueltaSegura(vuelta),
  });
  if (error) {
    console.error('[puente] crearPuente:', error.message);
    return null;
  }
  return codigo;
}

/**
 * Gasta el código: UN solo UPDATE que exige que sea de este restaurante,
 * que no esté usado y que no haya vencido. Dos canjes a la vez del mismo
 * código no pueden ganar los dos: el segundo ya ve `usado_at` puesto.
 */
export async function canjearPuente(
  codigo: string,
  restaurantId: string,
): Promise<{ authUserId: string; vuelta: string } | null> {
  const db = createServiceClient();
  const ahora = new Date().toISOString();
  const { data, error } = await db
    .from('cuenta_puentes')
    .update({ usado_at: ahora })
    .eq('codigo_hash', hashCodigo(codigo))
    .eq('restaurant_id', restaurantId)
    .is('usado_at', null)
    .gt('vence_at', ahora)
    .select('auth_user_id, vuelta')
    .maybeSingle();
  if (error) {
    console.error('[puente] canjearPuente:', error.message);
    return null;
  }
  if (!data) return null;
  return { authUserId: data.auth_user_id as string, vuelta: vueltaSegura(data.vuelta as string) };
}

/** Los restaurantes a los que se unió la cuenta, activos, del más reciente al más viejo. */
export async function restaurantesUnidos(authUserId: string): Promise<RestauranteDelPuente[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from('cuenta_restaurantes')
    .select('unido_at, restaurants(id, slug, name, status, restaurant_themes(brand_name, logo_url))')
    .eq('auth_user_id', authUserId)
    .order('unido_at', { ascending: false });
  if (error) {
    if (!faltaLaTabla(error)) console.error('[puente] restaurantesUnidos:', error.message);
    return [];
  }
  const lista: RestauranteDelPuente[] = [];
  for (const fila of (data ?? []) as Record<string, unknown>[]) {
    const r = (Array.isArray(fila.restaurants) ? fila.restaurants[0] : fila.restaurants) as Record<string, unknown> | null;
    if (!r || r.status !== 'active') continue;
    const temas = r.restaurant_themes as unknown;
    const tema = (Array.isArray(temas) ? temas[0] : temas) as { brand_name: string | null; logo_url: string | null } | null | undefined;
    lista.push({
      id: r.id as string,
      slug: r.slug as string,
      nombre: tema?.brand_name || (r.name as string),
      logoUrl: tema?.logo_url ?? null,
    });
  }
  return lista;
}
