import 'server-only';

import { createClient, getStaffUser } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

/* ============================================================
   EL CANDADO DEL SUPER ADMIN
   ------------------------------------------------------------
   Vivía dentro de `lib/actions/super-admin.ts`, privado, y estaba bien
   ahí mientras fuera el único archivo que lo necesitaba. Con las
   acciones de cuentas pasan a ser dos, y copiarlo es cómo se llega a
   que una de las dos copias se quede sin la comprobación el día que
   alguien la toque. Mismo motivo que `migracion-ausente.ts`.

   Lo que devuelve NO es un booleano: es el cliente de servicio, que
   salta RLS. Así no existe la forma de olvidarse de comprobar y aun así
   tener con qué escribir — para escribir hay que haber pasado por aquí.
   ============================================================ */

/** Quién está actuando, además de con qué. */
export type SuperAdminSession = {
  db: ReturnType<typeof createServiceClient>;
  actorId: string;
  /** Su correo, para congelarlo en la bitácora. */
  actorEmail: string | null;
};

/**
 * La sesión de Super Admin —cliente de servicio Y quién es— o `null`.
 *
 * Se lee el rol con el cliente de la SESIÓN, no con el de servicio: la
 * pregunta es quién es esta persona, y esa respuesta tiene que salir de
 * su propia sesión.
 *
 * Devuelve también el actor porque la bitácora (migración 132) lo necesita
 * en cada escritura, y sacarlo de aquí evita un segundo `getUser()` por
 * acción — y, sobre todo, evita que alguien registre como actor a quien no
 * pasó por este candado.
 */
export async function currentSuperAdmin(): Promise<SuperAdminSession | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await getStaffUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'SUPER_ADMIN') return null;
  return { db: createServiceClient(), actorId: user.id, actorEmail: user.email ?? null };
}

/**
 * El cliente de servicio si quien llama es SUPER_ADMIN, o `null`.
 * La forma corta, para las acciones que no registran nada.
 */
export async function verifySuperAdmin() {
  return (await currentSuperAdmin())?.db ?? null;
}
