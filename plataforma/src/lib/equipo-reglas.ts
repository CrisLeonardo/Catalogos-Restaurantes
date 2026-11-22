/* ============================================================
   EL EQUIPO DE UN LOCAL SE LEE DE LA MEMBRESÍA (auditoría 2026-11-21)
   ------------------------------------------------------------
   El panel ya decidía quién entra con `restaurant_members`, una fila por
   persona y local. Personal, en cambio, armaba su lista y sus candados con
   `profiles.restaurant_id`, que es un solo id: el «restaurante de casa».
   Quien trabaja en dos sucursales entraba al panel de las dos, pero sólo
   aparecía en la lista de una, y «Quitar del equipo» borraba la cuenta
   entera: lo sacaba también del otro local.

   Aquí viven las reglas, sin base de datos, para poder probarlas:
     · quién es personal de este local (y por tanto sale en la lista);
     · a quién se le puede cambiar la credencial desde este local;
     · qué significa quitar a alguien: retirar la membresía o borrar la
       cuenta, según tenga otros locales.
   ============================================================ */

import { LEGACY_ROLE, type MemberRole } from '@/lib/membership-roles';

export type PerfilEquipo = {
  id: string;
  full_name: string | null;
  permissions: string[] | null;
  role: string | null;
  restaurant_id: string | null;
};

export type MiembroEquipo = {
  user_id: string;
  role: string;
  status: string | null;
  permissions?: string[] | null;
};

const ROLES_DE_PERSONAL = ['RESTAURANT_STAFF', 'RESTAURANT_WAITER'];

/**
 * ¿Esta persona es del equipo de ESTE local?
 *
 * Con membresía aquí, manda la membresía: activa y que no sea de dueño.
 * Sin ella, el camino de antes de la 113 (perfil de personal con este
 * restaurante de casa), para las cuentas viejas que nunca la tuvieron.
 * El superadministrador nunca es personal de nadie.
 */
export function esPersonalDelLocal(
  perfil: Pick<PerfilEquipo, 'role' | 'restaurant_id'> | null,
  miembroAqui: Pick<MiembroEquipo, 'role' | 'status'> | null,
  restaurantId: string,
): boolean {
  if (!perfil || perfil.role === 'SUPER_ADMIN') return false;
  if (miembroAqui) return miembroAqui.status === 'active' && miembroAqui.role !== 'OWNER';
  return ROLES_DE_PERSONAL.includes(perfil.role ?? '') && perfil.restaurant_id === restaurantId;
}

/**
 * ¿La cuenta pertenece sólo a este local?
 *
 * Es la condición para cambiarle el PIN o la contraseña desde aquí. Un PIN
 * abre una sesión real de esa cuenta: si la persona también es dueña o
 * encargada de otro restaurante, el dueño de éste le estaría poniendo una
 * llave a un panel que no es suyo.
 */
export function esCuentaDelLocal(
  perfil: Pick<PerfilEquipo, 'restaurant_id'> | null,
  restaurantesDeSusOtrasMembresias: string[],
  restaurantId: string,
): boolean {
  if (!perfil || perfil.restaurant_id !== restaurantId) return false;
  return restaurantesDeSusOtrasMembresias.every((r) => r === restaurantId);
}

export type PlanDeRetiro =
  /** Sólo trabajaba aquí: se borra la cuenta, como siempre. */
  | { tipo: 'borrar-cuenta' }
  /**
   * Tiene otros locales: se retira la membresía de éste y nada más. Si su
   * perfil apuntaba aquí, se mueve a otro de sus locales; si no, el panel
   * lo seguiría dejando entrar por el camino del perfil.
   */
  | {
      tipo: 'retirar-membresia';
      nuevaCasa: { restaurantId: string; role: string; permissions: string[] | null } | null;
    };

export function planDeRetiro(
  perfil: Pick<PerfilEquipo, 'restaurant_id'>,
  otrasMembresias: { restaurantId: string; role: MemberRole; permissions: string[] | null }[],
  restaurantId: string,
): PlanDeRetiro {
  const otras = otrasMembresias.filter((m) => m.restaurantId !== restaurantId);
  const casaAqui = !perfil.restaurant_id || perfil.restaurant_id === restaurantId;

  if (otras.length === 0) {
    // Su casa es otro local aunque allí no tenga membresía (cuenta vieja):
    // tampoco se borra, sólo deja de ser de éste.
    return casaAqui ? { tipo: 'borrar-cuenta' } : { tipo: 'retirar-membresia', nuevaCasa: null };
  }
  if (!casaAqui) return { tipo: 'retirar-membresia', nuevaCasa: null };

  // La de dueño primero: si tiene un local propio, ése es su casa.
  const casa = otras.find((m) => m.role === 'OWNER') ?? otras[0];
  return {
    tipo: 'retirar-membresia',
    nuevaCasa: { restaurantId: casa.restaurantId, role: LEGACY_ROLE[casa.role], permissions: casa.permissions },
  };
}

/**
 * Junta a quien tiene membresía aquí con las cuentas viejas sin ella, y deja
 * sólo al personal del local. El papel que se devuelve es el de ESTE local:
 * la dueña de otro restaurante que aquí atiende caja sale como personal.
 */
export function componerEquipo(
  miembros: MiembroEquipo[],
  perfiles: PerfilEquipo[],
  restaurantId: string,
): PerfilEquipo[] {
  const miembroDe = new Map(miembros.map((m) => [m.user_id, m]));
  const vistos = new Set<string>();
  const equipo: PerfilEquipo[] = [];
  for (const p of perfiles) {
    if (vistos.has(p.id)) continue;
    vistos.add(p.id);
    const m = miembroDe.get(p.id) ?? null;
    if (!esPersonalDelLocal(p, m, restaurantId)) continue;
    equipo.push(
      m
        ? {
            ...p,
            role: LEGACY_ROLE[m.role as MemberRole] ?? 'RESTAURANT_STAFF',
            permissions: Array.isArray(m.permissions) ? m.permissions : null,
          }
        : p,
    );
  }
  return equipo;
}
