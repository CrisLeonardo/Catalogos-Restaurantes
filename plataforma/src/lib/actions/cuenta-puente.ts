'use server';

import { getWalletUser } from '@/lib/supabase/server';
import { urlDeCanje, viaSegura, vueltaSegura } from '@/lib/cuenta/puente';
import { crearPuente, restauranteParaPuente, unirse } from '@/lib/cuenta/puente-db';

/**
 * «Unirme» en la pantalla de permiso del puente (BIL-02 paso 2).
 *
 * Devuelve la URL de canje en vez de hacer `redirect()`: un redirect de
 * server action hacia otro host o al mismo ya nos dejó a gente en la
 * portada (memoria 2026-08-26). El navegador navega con la URL devuelta.
 *
 * La cuenta sale de la SESIÓN de la billetera, nunca de un parámetro.
 */
export async function aceptarPuente(
  slug: string,
  viaCruda: string,
  vueltaCruda: string,
): Promise<{ url: string } | { error: string }> {
  const user = await getWalletUser();
  if (!user) return { error: 'Tu sesión de Leogin se cerró. Vuelve a entrar.' };

  const restaurante = await restauranteParaPuente(slug);
  if (!restaurante) return { error: 'Este restaurante no está disponible.' };

  if (!(await unirse(user.id, restaurante.id))) {
    return { error: 'No pudimos unirte ahora. Intenta de nuevo en un momento.' };
  }
  const codigo = await crearPuente(user.id, restaurante.id, vueltaSegura(vueltaCruda));
  if (!codigo) return { error: 'No pudimos unirte ahora. Intenta de nuevo en un momento.' };

  return { url: urlDeCanje(restaurante.slug, viaSegura(viaCruda), codigo) };
}
