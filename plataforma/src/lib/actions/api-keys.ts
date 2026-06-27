'use server';

/* ============================================================
   API KEYS — Server actions (solo SUPER_ADMIN)
   Crear / listar / revocar llaves que Leogin emite a integradores.
   El secreto en claro se devuelve UNA sola vez al crear.
   ============================================================ */

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { createApiKey, listApiKeys, revokeApiKey, type ApiKeyRow } from '@/lib/api-keys';

async function currentSuperAdminId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  return profile?.role === 'SUPER_ADMIN' ? user.id : null;
}

export type ApiKeyCreateResult =
  | { error: string }
  | { ok: true; token: string; row: ApiKeyRow };

export async function createApiKeyAction(
  prev: ApiKeyCreateResult | null,
  formData: FormData,
): Promise<ApiKeyCreateResult> {
  const uid = await currentSuperAdminId();
  if (!uid) return { error: 'No autorizado.' };

  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { error: 'Ponle un nombre a la llave.' };

  const scopesRaw = String(formData.get('scopes') ?? '').trim();
  const scopes = scopesRaw ? scopesRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];
  const live = String(formData.get('live') ?? 'true') !== 'false';

  const res = await createApiKey({ name, scopes, live, createdBy: uid });
  if ('error' in res) return { error: res.error };

  revalidatePath('/super/configuracion');
  return { ok: true, token: res.token, row: res.row };
}

export async function revokeApiKeyAction(id: string): Promise<{ error?: string; ok?: boolean }> {
  const uid = await currentSuperAdminId();
  if (!uid) return { error: 'No autorizado.' };
  const res = await revokeApiKey(id);
  if (res.error) return { error: res.error };
  revalidatePath('/super/configuracion');
  return { ok: true };
}

export async function getApiKeys(): Promise<ApiKeyRow[]> {
  const uid = await currentSuperAdminId();
  if (!uid) return [];
  return listApiKeys();
}
