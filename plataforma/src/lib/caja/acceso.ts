/**
 * QUIÉN PUEDE TOCAR LA CAJA
 * ------------------------------------------------------------
 * La sesión tiene que ser del restaurante y tener la CAPACIDAD que pide cada
 * acción (auditoría 1.7, C05): abrir, registrar salida, cerrar, corregir,
 * devolver… Antes todo colgaba de la sección «Finanzas», que además enseña
 * las utilidades. Lo comparten las acciones de turnos
 * (`lib/actions/finanzas.ts`), las de corregir cobros
 * (`lib/actions/caja-correcciones.ts`) y los traspasos; vive aquí porque en
 * un archivo `'use server'` todo lo exportado es una acción llamable desde
 * el navegador, y esto no debe serlo.
 */

import { createServiceClient } from '@/lib/supabase/service';
import { actorEn, tiene } from '@/lib/auth/capacidades';
import { faltaLaColumna } from '@/lib/db/migracion-ausente';
import { normalizarCorte } from '@/lib/caja/dia';
import { verificarAprobador } from '@/lib/auth/firma-encargado';

const UUID_RE = /^[0-9a-f-]{36}$/i;

/** La firma de un encargado que viaja con una corrección. */
export interface FirmaInput {
  approverId?: string | null;
  approverPin?: string | null;
}

/**
 * Valida que el usuario autenticado pueda operar ESTE restaurante con alguna
 * de `llaves` (por defecto, cualquier tarea de Caja). Devuelve el client
 * service-role, la zona horaria y la hora de corte, o null si no autorizado.
 */
export async function authRestaurant(restaurantId: string, ...llaves: string[]): Promise<{
  db: ReturnType<typeof createServiceClient>;
  tz: string;
  /** Hora de corte del día de negocio en minutos (migración 145). */
  corte: number;
  slug: string;
  userId: string;
  cashierName: string | null;
  /** Puede firmar sola una corrección de cobro (tiene `caja.corregir`). */
  firmaSola: boolean;
  /** ¿Tiene esta llave? Para las acciones que distinguen dentro de Caja. */
  puede: (llave: string) => boolean;
  /** Arqueo ciego activo y sin `caja.ver_esperado`: no se le enseña lo esperado. */
  ciego: boolean;
} | null> {
  if (!UUID_RE.test(restaurantId)) return null;

  const actor = await actorEn(restaurantId);
  if (!actor) return null;
  if (!tiene(actor, ...(llaves.length ? llaves : ['caja']))) return null;

  const db = createServiceClient();
  const conCorte = await db
    .from('restaurants')
    .select('timezone, slug, day_cutoff_minutes, arqueo_ciego')
    .eq('id', restaurantId)
    .single();
  let r = conCorte.data as { timezone?: string; slug?: string; day_cutoff_minutes?: number; arqueo_ciego?: boolean } | null;
  // Sin la 177 (arqueo ciego) o sin la 145 (corte): lo que haya.
  if (conCorte.error && faltaLaColumna(conCorte.error)) {
    const corte = await db.from('restaurants').select('timezone, slug, day_cutoff_minutes').eq('id', restaurantId).single();
    if (!corte.error) r = corte.data;
    else {
      const { data } = await db.from('restaurants').select('timezone, slug').eq('id', restaurantId).single();
      r = data ? { ...data, day_cutoff_minutes: 0 } : null;
    }
  }

  const puede = (llave: string) => tiene(actor, llave);
  return {
    db,
    tz: (r?.timezone as string) || 'America/Guatemala',
    corte: normalizarCorte(r?.day_cutoff_minutes),
    slug: (r?.slug as string) || 'restaurante',
    userId: actor.userId,
    cashierName: actor.fullName,
    firmaSola: puede('caja.corregir'),
    puede,
    ciego: r?.arqueo_ciego === true && !puede('caja.ver_esperado'),
  };
}

export type CajaCtx = NonNullable<Awaited<ReturnType<typeof authRestaurant>>>;


/**
 * Firma una corrección: la propia si tiene la capacidad; si no, la de un
 * encargado que SÍ la tenga, con su PIN.
 */
export async function firmar(
  ctx: CajaCtx, restaurantId: string, firma: FirmaInput, llave = 'caja.corregir',
): Promise<{ id: string } | { error: string }> {
  if (ctx.puede(llave)) return { id: ctx.userId };
  if (!firma.approverId || !firma.approverPin) return { error: 'Esto lo autoriza un encargado con su PIN.' };
  return verificarAprobador(ctx.db, restaurantId, firma.approverId, firma.approverPin, llave);
}
