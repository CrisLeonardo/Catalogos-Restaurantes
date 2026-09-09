/* ============================================================
   CÓMO SE CLASIFICA UNA CUENTA DE LEOGIN
   ------------------------------------------------------------
   Vive aparte de `lib/db/accounts.ts` —que es quien consulta— porque
   estas reglas son el motivo de la pantalla y no se pueden comprobar
   leyéndolas: cada una existe porque hay una persona concreta a la que
   hoy no se puede rescatar, y confundir dos de ellas es enseñar el
   problema equivocado.

   Las tres que importan:

     · PERTENECER A UN LOCAL son DOS cosas — la membresía
       (`restaurant_members`, migración 113) y el `profiles.restaurant_id`
       de siempre, que es el que sigue escribiendo el alta del Super
       Admin. Contar solo la primera marcaría «sin ningún local» justo a
       las cuentas creadas desde `/super`.

     · SIN LOCAL y HUÉRFANA no son lo mismo, aunque las dos sean «no
       administra nada». Sin local con rol de dueño es alguien que dejó
       el registro a medias y se puede terminar. Huérfana es personal
       cuyo restaurante se borró debajo (`profiles.restaurant_id` es
       `on delete set null`): esa cuenta sigue entrando al login, no
       tiene a dónde ir, y nadie la va a volver a ver.

     · VERIFICADO no es `email_confirmed_at` de Auth. El alta lo pone en
       verdadero desde el primer segundo para que la persona entre de
       una vez, así que ahí siempre hay fecha y no distingue nada. La
       señal real es `profiles.email_verified_at` —abrió nuestro enlace—
       o venir por Google, que ya lo verificó por su cuenta.
   ============================================================ */

import { isSyntheticStaffEmail } from '@/lib/staff-email';
import type { MemberRole } from '@/lib/membership-roles';
import type { Profile } from '@/types';

/** Fila cruda de la vista `admin_accounts` (migración 131). */
export type CuentaCruda = {
  id: string;
  full_name: string | null;
  role: Profile['role'];
  restaurant_id: string | null;
  email_verified_at: string | null;
  email: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  banned_until: string | null;
  providers: string[] | null;
};

/** Lo que se sabe del restaurante en sí, sin la persona de por medio. */
export type LocalBasico = {
  name: string;
  slug: string;
  /** `plan_actual`. Null si la migración que lo trajo no ha corrido. */
  plan: string | null;
  /** `active` | `suspended`. */
  status: string | null;
};

export type AccountLocal = LocalBasico & {
  restaurantId: string;
  /** Su papel ahí, en el vocabulario de las membresías. */
  role: MemberRole;
  /** true = cuelga de `profiles.restaurant_id`, no de una membresía. */
  legacy: boolean;
};

export type AccountRow = {
  id: string;
  email: string | null;
  fullName: string | null;
  role: Profile['role'];
  providers: string[];
  /** Credencial de turno del local (`usuario@slug`), no la cuenta de una persona. */
  esPin: boolean;
  /** Abrió nuestro enlace de confirmación, o entró con Google. */
  verificado: boolean;
  /** Cuenta suspendida en Auth (`banned_until` en el futuro). */
  suspendida: boolean;
  createdAt: string | null;
  lastSignInAt: string | null;
  locales: AccountLocal[];
  /** Ni membresía ni `restaurant_id`: no administra nada. */
  sinLocal: boolean;
  /** Sin local Y con rol de personal: el restaurante desapareció debajo. */
  huerfana: boolean;
};

/** El rol de membresía equivalente a un rol de perfil (el camino viejo). */
const ROL_DE_PERFIL: Record<Profile['role'], MemberRole> = {
  SUPER_ADMIN: 'OWNER',
  RESTAURANT_OWNER: 'OWNER',
  RESTAURANT_STAFF: 'STAFF',
  RESTAURANT_WAITER: 'WAITER',
};

/**
 * Una fila de la lista, ya cruzada.
 *
 * @param membresias   sus filas vivas de `restaurant_members`, ya resueltas
 *                     a nombre de restaurante.
 * @param buscarLocal  el catálogo de restaurantes, para el camino viejo.
 * @param ahora        milisegundos; se pasa para poder fijarlo en las pruebas.
 */
export function armarCuenta(
  f: CuentaCruda,
  membresias: AccountLocal[],
  buscarLocal: (restaurantId: string) => LocalBasico | undefined,
  ahora: number = Date.now(),
): AccountRow {
  const locales = [...membresias];

  // El camino viejo, SOLO si no salía ya por membresía: quien está en los
  // dos sitios se cuenta una vez, y como lo que es (su membresía manda,
  // porque es la que lleva el rol de verdad).
  if (f.restaurant_id && !locales.some((l) => l.restaurantId === f.restaurant_id)) {
    const local = buscarLocal(f.restaurant_id);
    // Un `restaurant_id` que apunta a un restaurante inexistente no debería
    // poder ocurrir (la FK lo pone en null al borrar), pero si ocurre no se
    // inventa un nombre: la cuenta sale como lo que es, sin local.
    if (local) {
      locales.push({
        restaurantId: f.restaurant_id,
        ...local,
        role: ROL_DE_PERFIL[f.role] ?? 'STAFF',
        legacy: true,
      });
    }
  }

  const providers = (f.providers ?? []).filter(Boolean);
  // El super admin no administra locales por definición: marcarlo «sin
  // ningún local» lo pondría en la lista de gente atascada.
  const sinLocal = locales.length === 0 && f.role !== 'SUPER_ADMIN';

  return {
    id: f.id,
    email: f.email,
    fullName: f.full_name,
    role: f.role,
    providers,
    esPin: isSyntheticStaffEmail(f.email),
    verificado: !!f.email_verified_at || providers.includes('google'),
    suspendida: !!f.banned_until && new Date(f.banned_until).getTime() > ahora,
    createdAt: f.created_at,
    lastSignInAt: f.last_sign_in_at,
    locales: locales.sort((a, b) => a.name.localeCompare(b.name, 'es')),
    sinLocal,
    huerfana: sinLocal && f.role !== 'RESTAURANT_OWNER',
  };
}
