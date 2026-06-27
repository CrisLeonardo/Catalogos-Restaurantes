/* ============================================================
   API KEYS — generación, hashing y verificación
   ------------------------------------------------------------
   Llaves que Leogin EMITE a integradores externos para llamar su API
   (p.ej. webhooks de pasarela de pago, conciliación bancaria a futuro).

   Seguridad:
   · Se genera un token aleatorio fuerte (32 bytes). En la BD solo se guarda
     su hash SHA-256 — el secreto en claro se devuelve UNA vez al crearla.
   · Formato: `lk_<entorno>_<random>`; `key_prefix` (primeros 12 chars) se
     guarda para identificar la llave sin exponer el secreto.
   · Verificación en tiempo constante por hash (no se busca por el secreto).

   Las llaves SECRETAS de terceros (Stripe/Recurrente) NO se gestionan aquí:
   esas van en variables de entorno. Ver docs/PAGOS_INTEGRACION.md.
   ============================================================ */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/service';

const PREFIX_LEN = 12;

/** SHA-256 en hex del token completo. */
export function hashApiKey(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Genera un token nuevo en claro (no lo persiste). */
export function generateApiKeyToken(live = true): string {
  const env = live ? 'live' : 'test';
  const random = randomBytes(24).toString('base64url'); // ~32 chars url-safe
  return `lk_${env}_${random}`;
}

export interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  restaurant_id: string | null;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

/**
 * Crea una llave: persiste el hash y devuelve el token EN CLARO una sola vez.
 * El llamador debe mostrarlo al usuario y nunca volver a guardarlo en claro.
 */
export async function createApiKey(opts: {
  name: string;
  scopes?: string[];
  restaurantId?: string | null;
  createdBy?: string | null;
  live?: boolean;
  expiresAt?: string | null;
}): Promise<{ token: string; row: ApiKeyRow } | { error: string }> {
  const token = generateApiKeyToken(opts.live ?? true);
  const key_hash = hashApiKey(token);
  const key_prefix = token.slice(0, PREFIX_LEN);

  const db = createServiceClient();
  const { data, error } = await db
    .from('api_keys')
    .insert({
      name: opts.name,
      key_prefix,
      key_hash,
      scopes: opts.scopes ?? [],
      restaurant_id: opts.restaurantId ?? null,
      created_by: opts.createdBy ?? null,
      expires_at: opts.expiresAt ?? null,
    })
    .select('id, name, key_prefix, scopes, restaurant_id, last_used_at, expires_at, revoked_at, created_at')
    .single();

  if (error) return { error: error.message };
  return { token, row: data as ApiKeyRow };
}

/** Lista las llaves (sin el secreto). */
export async function listApiKeys(): Promise<ApiKeyRow[]> {
  const db = createServiceClient();
  const { data } = await db
    .from('api_keys')
    .select('id, name, key_prefix, scopes, restaurant_id, last_used_at, expires_at, revoked_at, created_at')
    .order('created_at', { ascending: false });
  return (data ?? []) as ApiKeyRow[];
}

/** Revoca una llave (no la borra: deja rastro de auditoría). */
export async function revokeApiKey(id: string): Promise<{ error?: string }> {
  const db = createServiceClient();
  const { error } = await db.from('api_keys').update({ revoked_at: new Date().toISOString() }).eq('id', id);
  return error ? { error: error.message } : {};
}

export interface VerifiedKey {
  id: string;
  scopes: string[];
  restaurant_id: string | null;
}

/**
 * Verifica un token entrante. Devuelve la llave si es válida, vigente y no
 * revocada; si no, null. Actualiza last_used_at de forma best-effort.
 */
export async function verifyApiKey(token: string | null | undefined): Promise<VerifiedKey | null> {
  if (!token || typeof token !== 'string' || !token.startsWith('lk_')) return null;
  const hash = hashApiKey(token);

  const db = createServiceClient();
  const { data } = await db
    .from('api_keys')
    .select('id, key_hash, scopes, restaurant_id, revoked_at, expires_at')
    .eq('key_hash', hash)
    .maybeSingle();

  if (!data) return null;

  // Comparación en tiempo constante (defensa en profundidad; la búsqueda ya fue por hash).
  const a = Buffer.from(hash);
  const b = Buffer.from((data.key_hash as string) ?? '');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  if (data.revoked_at) return null;
  if (data.expires_at && new Date(data.expires_at as string).getTime() < Date.now()) return null;

  // best-effort: marca uso sin bloquear la respuesta
  db.rpc('api_key_touch', { p_hash: hash }).then(() => {}, () => {});

  return {
    id: data.id as string,
    scopes: (data.scopes as string[]) ?? [],
    restaurant_id: (data.restaurant_id as string | null) ?? null,
  };
}

/** Extrae el bearer token del header Authorization. */
export function bearerFromHeaders(headers: Headers): string | null {
  const auth = headers.get('authorization') || headers.get('Authorization');
  if (!auth) return null;
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return m ? m[1].trim() : null;
}
