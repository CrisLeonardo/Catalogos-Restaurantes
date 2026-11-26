/**
 * Usuarios por plan (auditoría de lanzamiento 2026-11-23, LZ-08).
 * ------------------------------------------------------------
 * Los planes anunciaban un cupo por plan y nada lo aplicaba: cualquier
 * dueño, incluso en Básico, podía dar de alta a todo su equipo.
 *
 * Política decidida por el dueño el 2026-11-23:
 *  · Cuenta TODA persona con acceso al panel de ese local, dueño incluido,
 *    entre con correo, usuario o PIN. Básico y En línea: solo el dueño;
 *    Estándar: el dueño y dos personas más; Premium y Pro: sin tope.
 *  · Una invitación pendiente ocupa lugar: si no, se podían mandar cinco y
 *    que entraran todas.
 *  · Quien ya tiene más personas que su plan las conserva: nadie pierde el
 *    acceso. Solo no puede sumar a otra hasta liberar un lugar o subir de plan.
 *  · El Super Admin no pasa por aquí: dar de alta por soporte es una
 *    excepción explícita.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { PLANS, validPlanCode, type PlanCode } from '@/lib/plans';

/** Personas con acceso que incluye el plan; null = sin tope. */
export function cupoDeUsuarios(plan: string | null | undefined): number | null {
  const u = PLANS[validPlanCode(plan)].users;
  return u === 'unlimited' ? null : u;
}

/** El plan más barato que deja sumar a alguien a un equipo de `ocupados`. */
function planQueAlcanza(ocupados: number): PlanCode {
  const est = PLANS.ESTANDAR.users;
  return typeof est === 'number' && ocupados < est ? 'ESTANDAR' : 'PREMIUM';
}

/** null si cabe una persona más; si no, por qué no y qué hacer. */
export function errorDeCupo(plan: string | null | undefined, ocupados: number): string | null {
  const cupo = cupoDeUsuarios(plan);
  if (cupo == null || ocupados < cupo) return null;
  const nombre = PLANS[validPlanCode(plan)].name;
  const sube = PLANS[planQueAlcanza(ocupados)].name;
  if (cupo === 1) {
    return `Tu plan ${nombre} incluye 1 usuario: tú. Para sumar a tu equipo, sube a ${sube}.`;
  }
  return `Tu plan ${nombre} incluye ${cupo} usuarios contándote a ti, y ya están ocupados. `
    + `Para sumar a alguien más, quita a alguien del equipo o sube a ${sube}.`;
}

/**
 * Lugares ocupados en el equipo de un local: miembros con acceso (activos o
 * invitados) y, si `conInvitaciones`, invitaciones por correo aún vigentes.
 * Lanza si no puede contar: ante la duda no se deja pasar a nadie más.
 */
export async function lugaresOcupados(
  db: SupabaseClient, restaurantId: string, { conInvitaciones = true } = {},
): Promise<number> {
  const miembros = await db.from('restaurant_members').select('user_id', { count: 'exact', head: true })
    .eq('restaurant_id', restaurantId).in('status', ['active', 'invited']);
  if (miembros.error) throw new Error(`No se pudo contar el equipo: ${miembros.error.message}`);
  if (!conInvitaciones) return miembros.count ?? 0;
  const invitaciones = await db.from('restaurant_invitations').select('id', { count: 'exact', head: true })
    .eq('restaurant_id', restaurantId).is('accepted_at', null).gt('expires_at', new Date().toISOString());
  if (invitaciones.error) throw new Error(`No se pudieron contar las invitaciones: ${invitaciones.error.message}`);
  return (miembros.count ?? 0) + (invitaciones.count ?? 0);
}

/** ¿El motivo es que no se pudo leer, y no que el equipo esté lleno? */
export function esFallaDeLectura(motivo: string): boolean {
  return motivo.startsWith('No se pudo');
}

/** Lee el plan del local y responde si cabe una persona más (null = sí). */
export async function verificarCupo(
  db: SupabaseClient, restaurantId: string, opciones: { conInvitaciones?: boolean } = {},
): Promise<string | null> {
  const { data, error } = await db.from('restaurants').select('plan_actual').eq('id', restaurantId).maybeSingle();
  if (error || !data) return 'No se pudo comprobar tu plan. Inténtalo de nuevo.';
  const plan = data.plan_actual as string | null;
  if (cupoDeUsuarios(plan) == null) return null;
  try {
    return errorDeCupo(plan, await lugaresOcupados(db, restaurantId, opciones));
  } catch {
    return 'No se pudo comprobar cuántas personas tiene tu equipo. Inténtalo de nuevo.';
  }
}
