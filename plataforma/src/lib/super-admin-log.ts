import 'server-only';

import { headers } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/service';
import { faltaLaTabla } from '@/lib/db/migracion-ausente';
import { clientIp } from '@/lib/rate-limit';
import type { SuperAdminSession } from '@/lib/auth/super-admin-guard';

/* ============================================================
   ESCRIBIR EN LA BITÁCORA DEL SUPER ADMIN (migración 132)
   ------------------------------------------------------------
   El compañero de `lib/activity.ts`, que es la bitácora DEL LOCAL
   —exige `restaurant_id` y se enseña en /admin/personal, para que el
   dueño vigile a su personal—. Esta es la tuya, y la mitad de lo que
   registra no tiene restaurante ninguno.

   DOS REGLAS:

   1) No interrumpe. Si la bitácora falla, la acción que la llamó ya
      pasó y se queda como está: un fallo al registrar no puede
      convertirse en un rescate a medias, con la contraseña cambiada y
      un error en pantalla. Pero SÍ se grita por consola — callar un
      fallo de la bitácora es cómo se descubre meses después que no
      había nada escrito.

   2) Se congela el texto. `actorEmail` y `targetLabel` se guardan tal
      como son AHORA, no se resuelven al leer. Si esa cuenta o ese
      restaurante desaparecen, la fila tiene que seguir diciendo a
      quién se le hizo qué. Es la misma idea que la falta de claves
      foráneas en la tabla (ver la migración).

   Nunca se guarda una contraseña ni un token en `meta`. Ni la nueva
   ni la vieja ni un trozo: la bitácora se consulta para explicar algo
   a un cliente y no puede ser una lista de credenciales.
   ============================================================ */

/**
 * Qué pasó, en `objeto.verbo`.
 *
 * En la tabla es texto libre a propósito —añadir una acción no puede
 * exigir una migración, o se acaba no registrando la nueva— pero aquí sí
 * es una unión cerrada: lo que hay que evitar es que dos sitios escriban
 * `cuenta.password` y `cuenta.contrasena` y la pantalla enseñe la mitad.
 */
export type AccionSuper =
  // La ficha de una cuenta (fase 2)
  | 'cuenta.contrasena'
  | 'cuenta.correo'
  | 'cuenta.enlace-recuperacion'
  // Los accesos desde la ficha de un restaurante
  | 'acceso.crear'
  | 'acceso.contrasena'
  | 'acceso.quitar'
  // El restaurante. Crear y duplicar NO se registran: no son
  // irreversibles ni tocan la cuenta de nadie, y una bitácora que
  // apunta todo es una que nadie lee.
  | 'restaurante.borrar'
  | 'restaurante.plan'
  | 'restaurante.estado'
  // Grupos
  | 'grupo.borrar';

export type EntradaDeBitacora = {
  action: AccionSuper;
  /** Sobre quién. */
  targetUserId?: string | null;
  /** Sobre qué local. */
  targetRestaurantId?: string | null;
  /** Su correo o su nombre, para que la fila se lea sin resolver nada. */
  targetLabel?: string | null;
  /** Detalle de la acción. Nunca contraseñas ni tokens. */
  meta?: Record<string, unknown> | null;
};

/**
 * Deja constancia. Nunca lanza.
 *
 * El actor sale de `currentSuperAdmin()` y se pasa entero: así no hay forma
 * de registrar como actor a alguien que no pasó por el candado, ni de
 * olvidarse de comprobar quién llama antes de escribir.
 */
export async function logSuper(
  sesion: Pick<SuperAdminSession, 'actorId' | 'actorEmail'>,
  entrada: EntradaDeBitacora,
): Promise<void> {
  try {
    const db = createServiceClient();
    const { error } = await db.from('super_admin_log').insert({
      actor_id: sesion.actorId,
      actor_email: sesion.actorEmail,
      action: entrada.action,
      target_user_id: entrada.targetUserId ?? null,
      target_restaurant_id: entrada.targetRestaurantId ?? null,
      target_label: entrada.targetLabel ?? null,
      meta: entrada.meta ?? null,
      ip: clientIp(await headers()),
    });

    if (!error) return;

    // La migración todavía no ha corrido en esta base. Es el caso normal
    // entre que sale el código y alguien pega el SQL en producción, así
    // que se avisa una vez y sin ruido de error.
    if (faltaLaTabla(error)) {
      console.warn(
        `[bitacora] la migración 132 no ha corrido aquí: «${entrada.action}» no quedó registrada`,
      );
      return;
    }
    console.error(`[bitacora] no se pudo registrar «${entrada.action}»:`, error.message);
  } catch (e) {
    // Ni un fallo de red ni uno de `headers()` pueden tumbar la acción que
    // ya se hizo. Pero tampoco pueden pasar en silencio.
    console.error(`[bitacora] no se pudo registrar «${entrada.action}»:`, e);
  }
}
