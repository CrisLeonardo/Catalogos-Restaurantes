/* ============================================================
   MEMBRESÍAS — tipos y reglas de rol (migración 112)
   ------------------------------------------------------------
   Sin dependencias de servidor a propósito: esto lo necesitan por igual la
   capa de datos (lib/db/membership.ts, que sí habla con la base) y las
   pantallas del navegador, que pintan el rol y deciden qué botones enseñar.

   Las reglas de abajo son la MISMA verdad que aplican las acciones en el
   servidor; aquí solo sirven para no mostrar un botón que luego iba a ser
   rechazado. Nunca son el candado: el candado siempre vuelve a comprobarse
   del lado del servidor.
   ============================================================ */

export type MemberRole = 'OWNER' | 'MANAGER' | 'STAFF' | 'WAITER';

export type Membership = {
  restaurantId: string;
  role: MemberRole;
  permissions: string[] | null;
};

/** Una tarjeta de la pantalla Mi cuenta. */
export type MembershipCard = Membership & {
  name: string;
  slug: string;
  logoUrl: string | null;
  paused: boolean;
  /** Este restaurante pide PIN al abrirlo. */
  locked: boolean;
};

const ROLE_LABEL: Record<MemberRole, string> = {
  OWNER: 'Dueño',
  MANAGER: 'Gerente',
  STAFF: 'Personal',
  WAITER: 'Mesero',
};

export function roleLabel(role: MemberRole): string {
  return ROLE_LABEL[role] ?? role;
}

/** El cobro, el plan y crear restaurantes son solo del dueño. */
export function canBill(role: MemberRole): boolean {
  return role === 'OWNER';
}

/** Dueño y gerente administran el equipo del local; el resto no. */
export function canManageStaff(role: MemberRole): boolean {
  return role === 'OWNER' || role === 'MANAGER';
}

/** Cómo se ve cada rol de membresía desde los roles de perfil de siempre. */
export const LEGACY_ROLE: Record<MemberRole, string> = {
  OWNER: 'RESTAURANT_OWNER',
  MANAGER: 'RESTAURANT_STAFF',
  STAFF: 'RESTAURANT_STAFF',
  WAITER: 'RESTAURANT_WAITER',
};
