/**
 * ¿Puede esta persona operar las mesas de este restaurante?
 * ------------------------------------------------------------
 * Vive aquí, y NO en `lib/actions/orders.ts` donde nació, por dos razones:
 *
 *  · desde la migración 128 el salón tiene un segundo archivo de acciones
 *    —sentar y repartir mesas— y la regla de acceso tiene que ser la misma
 *    para «cobrar la mesa 7» que para «sentar a cuatro en la 7»;
 *  · `orders.ts` es `'use server'`, y ahí TODO lo exportado se convierte en
 *    un punto de entrada desde el navegador. Un guardián no es una acción:
 *    exportarlo desde ahí lo publicaría como tal.
 */

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveEffectiveRole } from '@/lib/db/membership';
import { canActOnGroupBranch } from '@/lib/db/admin';
import { can } from '@/lib/permissions';

/** Autorización compartida de la cuenta de mesa: sesión válida, del mismo
 *  restaurante y con permiso sobre el salón. */
/** Quién está tocando la mesa, ya comprobado. */
export interface TableActor {
  userId: string;
  role: string;
  /** El restaurante del perfil. `null` en el super admin, que no tiene uno. */
  profileRestaurantId: string | null;
}

/**
 * ¿Puede esta persona operar las mesas de este restaurante?
 *
 * Es la ÚNICA regla, y devuelve al actor para que quien la llame no tenga
 * que volver a pedir el perfil. Antes estaba copiada palabra por palabra en
 * `freeTable`, `archiveAbandonedTables` y aquí: tres sitios donde arreglar
 * lo mismo, y de hecho ya habían empezado a separarse.
 *
 * Pasa quien: administra el grupo de esta sucursal, es su propio restaurante
 * (migración 116: ya no hay un rol que preguntar), tiene membresía aquí —el
 * caso del dueño desde el modelo de membresías, cuyo `restaurant_id` nace en
 * null— o es el super admin.
 *
 * SUPER_ADMIN (2026-08-26): las tres funciones de mesa eran las únicas del
 * archivo que lo dejaban fuera. `updateOrderStatus`, `getPendingNewOrders` y
 * `resolveOrderRestaurant` ya lo admiten, y el layout del panel de mesero
 * también ("SUPER_ADMIN sí entra, soporte/pruebas"). El resultado no era un
 * candado sino una pantalla rota: en Tomar pedidos veía el salón entero con
 * sus totales —`getActiveTableNumbers` no filtra por persona— y al abrir una
 * mesa le salía "No autorizado" en la comanda. Se estaba escondiendo el
 * detalle de un dinero que ya se enseñaba dos centímetros más arriba.
 *
 * `secciones` (migración 128): qué permiso basta. Por defecto «mesero», que
 * es lo que exigen cobrar, servir y atender. Sentar y repartir aceptan
 * ADEMÁS «mesas», porque el puesto de mando es un trabajo distinto: la
 * persona que recibe en la puerta reparte el salón y puede no tomar un solo
 * pedido en todo el turno. Sin esto, el permiso «Mesas» dejaba entrar a la
 * pantalla y no dejaba hacer nada en ella.
 */
export async function assertTableAccess(
  restaurantId: string,
  secciones: string[] = ['mesero'],
): Promise<{ error: string } | { actor: TableActor }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'No autorizado.' };

  const db = createServiceClient();
  const { data: profile } = await db
    .from('profiles')
    .select('role, restaurant_id, permissions')
    .eq('id', user.id)
    .single();
  if (!profile) return { error: 'No autorizado.' };

  const role = profile.role as string;
  const esSuper = role === 'SUPER_ADMIN';

  const efectivo = await resolveEffectiveRole(
    { role, permissions: (profile.permissions as string[] | null) ?? null },
    restaurantId,
  );
  const ownsBranch = esSuper
    || (await canActOnGroupBranch(restaurantId))
    || efectivo.isMember
    || profile.restaurant_id === restaurantId;

  // El super admin no tiene permisos de restaurante que consultar: su rol ES
  // el permiso, igual que en el resto de acciones de este archivo.
  const puede = esSuper
    || secciones.some((s) => can(efectivo.role, efectivo.permissions, s));
  if (!ownsBranch || !puede) {
    return { error: 'No autorizado.' };
  }

  return {
    actor: {
      userId: user.id,
      role,
      profileRestaurantId: (profile.restaurant_id as string | null) ?? null,
    },
  };
}
