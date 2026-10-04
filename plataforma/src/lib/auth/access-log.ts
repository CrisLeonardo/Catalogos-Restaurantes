import 'server-only';

import { createServiceClient } from '@/lib/supabase/service';
import { clientIp } from '@/lib/rate-limit';

/* ============================================================
   BITÁCORA DE ACCESOS AL PANEL (migración 109)
   ------------------------------------------------------------
   Un renglón por inicio de sesión. Antes no quedaba rastro de
   quién entró, desde dónde ni cuándo: si un dueño sospechaba que
   alguien más había entrado a su cuenta, no había forma ni de
   confirmarlo ni de desmentirlo.

   Fire-and-forget, como logActivity: una bitácora nunca puede
   impedir que alguien entre a trabajar.
   ============================================================ */

export type AccessMethod = 'password' | 'google' | 'pin' | 'soporte' | 'mi_cuenta';

export async function logPanelAccess(input: {
  profileId: string;
  restaurantId: string | null;
  method: AccessMethod;
  headers: Headers;
}): Promise<void> {
  try {
    const db = createServiceClient();
    await db.from('panel_access_log').insert({
      profile_id: input.profileId,
      restaurant_id: input.restaurantId,
      method: input.method,
      ip: clientIp(input.headers),
      // Se guarda recortado: lo que interesa es distinguir dispositivos, no
      // archivar la cadena entera que manda cada navegador.
      user_agent: (input.headers.get('user-agent') ?? '').slice(0, 300) || null,
    });
  } catch {
    // Nunca debe interrumpir un login.
  }
}

export type AccessRow = {
  id: number;
  method: AccessMethod;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
  actor_name: string | null;
};

/** Últimos accesos del restaurante, para mostrárselos al dueño. */
export async function getPanelAccessLog(restaurantId: string, limit = 20): Promise<AccessRow[]> {
  const db = createServiceClient();
  const { data } = await db
    .from('panel_access_log')
    .select('id, method, ip, user_agent, created_at, profiles(full_name, role)')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })
    .limit(limit);

  return ((data ?? []) as unknown as Array<
    Omit<AccessRow, 'actor_name'> & { profiles: { full_name: string | null; role: string | null } | null }
  >).map((r) => ({
    id: r.id,
    method: r.method,
    ip: r.ip,
    user_agent: r.user_agent,
    created_at: r.created_at,
    // Sin nombre en el perfil, la lista decía «Cuenta sin nombre» en cada
    // fila — casi siempre era el propio dueño (auditoría 2026-10-02, AJU-12).
    actor_name: r.profiles?.full_name
      ?? (r.profiles?.role === 'RESTAURANT_OWNER' ? 'Dueño del restaurante'
        : r.profiles?.role === 'SUPER_ADMIN' ? 'Soporte de Leogin'
        : r.profiles ? 'Miembro del equipo' : null),
  }));
}

/**
 * Nombre corto del dispositivo a partir del user-agent. No pretende ser
 * exacto: el dueño solo necesita reconocer "ese soy yo" o "ese no soy yo".
 */
export function describeDevice(userAgent: string | null): string {
  if (!userAgent) return 'Dispositivo desconocido';
  const ua = userAgent.toLowerCase();
  const os =
    ua.includes('android') ? 'Android' :
    ua.includes('iphone') || ua.includes('ipad') ? 'iPhone/iPad' :
    ua.includes('windows') ? 'Windows' :
    ua.includes('mac os') ? 'Mac' :
    ua.includes('linux') ? 'Linux' : 'Otro';
  const browser =
    ua.includes('edg/') ? 'Edge' :
    ua.includes('chrome') ? 'Chrome' :
    ua.includes('firefox') ? 'Firefox' :
    ua.includes('safari') ? 'Safari' : 'navegador';
  return `${os} · ${browser}`;
}
