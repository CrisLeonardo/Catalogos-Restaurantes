/**
 * QUIÉN PUEDE TOCAR LA CAJA
 * ------------------------------------------------------------
 * La sesión tiene que ser del restaurante y tener la sección «Finanzas»
 * (Caja vive dentro). Lo comparten las acciones de turnos
 * (`lib/actions/finanzas.ts`) y las de corregir cobros
 * (`lib/actions/caja-correcciones.ts`); vive aquí porque en un archivo
 * `'use server'` todo lo exportado es una acción llamable desde el
 * navegador, y esto no debe serlo.
 */

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { canActOnGroupBranch } from '@/lib/db/admin';
import { resolveEffectiveRole } from '@/lib/db/membership';
import { can } from '@/lib/permissions';
import { faltaLaColumna } from '@/lib/db/migracion-ausente';
import { normalizarCorte } from '@/lib/caja/dia';
import { puedeAprobar } from '@/lib/void-approval';
import { verificarAprobador } from '@/lib/auth/firma-encargado';

const UUID_RE = /^[0-9a-f-]{36}$/i;

/** La firma de un encargado que viaja con una corrección. */
export interface FirmaInput {
  approverId?: string | null;
  approverPin?: string | null;
}

/**
 * Valida que el usuario autenticado pueda operar ESTE restaurante.
 * Devuelve el client service-role, la zona horaria y la hora de corte, o
 * null si no autorizado.
 */
export async function authRestaurant(restaurantId: string): Promise<{
  db: ReturnType<typeof createServiceClient>;
  tz: string;
  /** Hora de corte del día de negocio en minutos (migración 145). */
  corte: number;
  slug: string;
  userId: string;
  cashierName: string | null;
  /** Puede firmar sola una corrección (no es mesero puro). */
  firmaSola: boolean;
} | null> {
  if (!UUID_RE.test(restaurantId)) return null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, restaurant_id, permissions, full_name')
    .eq('id', user.id)
    .single();

  // Qué es esta persona EN ESTE restaurante. El perfil solo sabe de uno —y
  // desde el modelo de membresías el dueño lo tiene en null— así que
  // preguntárselo a él dejaba fuera al dueño de su propio negocio.
  const efectivo = await resolveEffectiveRole(
    { role: profile?.role ?? null, permissions: (profile?.permissions as string[] | null) ?? null },
    restaurantId,
  );

  const belongs =
    profile?.role === 'SUPER_ADMIN' ||
    efectivo.isMember ||
    (['RESTAURANT_OWNER', 'RESTAURANT_STAFF'].includes(profile?.role ?? '') &&
      profile?.restaurant_id === restaurantId) ||
    (await canActOnGroupBranch(restaurantId));
  if (!belongs) return null;
  if (!can(efectivo.role, efectivo.permissions, 'finanzas')) return null;

  const db = createServiceClient();
  const conCorte = await db
    .from('restaurants')
    .select('timezone, slug, day_cutoff_minutes')
    .eq('id', restaurantId)
    .single();
  let r = conCorte.data as { timezone?: string; slug?: string; day_cutoff_minutes?: number } | null;
  // Sin la 145 el día es el de calendario, como siempre.
  if (conCorte.error && faltaLaColumna(conCorte.error)) {
    const { data } = await db.from('restaurants').select('timezone, slug').eq('id', restaurantId).single();
    r = data ? { ...data, day_cutoff_minutes: 0 } : null;
  }

  return {
    db,
    tz: (r?.timezone as string) || 'America/Guatemala',
    corte: normalizarCorte(r?.day_cutoff_minutes),
    slug: (r?.slug as string) || 'restaurante',
    userId: user.id,
    cashierName: (profile?.full_name as string) || null,
    firmaSola: puedeAprobar(efectivo.role, efectivo.permissions),
  };
}

export type CajaCtx = NonNullable<Awaited<ReturnType<typeof authRestaurant>>>;


/** Firma una corrección: la propia si es encargado, si no la del PIN. */
export async function firmar(ctx: CajaCtx, restaurantId: string, firma: FirmaInput): Promise<{ id: string } | { error: string }> {
  if (ctx.firmaSola) return { id: ctx.userId };
  if (!firma.approverId || !firma.approverPin) return { error: 'Esto lo autoriza un encargado con su PIN.' };
  return verificarAprobador(ctx.db, restaurantId, firma.approverId, firma.approverPin);
}
