'use server';

/* ============================================================
   DAR Y QUITAR ACCESO A UN LOCAL, DESDE /super (fase 4)
   ------------------------------------------------------------
   Hallazgo A-08: no existía NINGUNA escritura a `restaurant_members`
   desde el Super Admin. Cero. El día que un dueño vendiera el local, se
   peleara con el socio o perdiera la cuenta de Google con la que se
   registró, ese restaurante se quedaba con un dueño que no podía entrar
   y no había forma de nombrar otro. Lo único disponible era borrar el
   restaurante entero.

   El traspaso es esto: nombrar dueño al comprador y quitar al vendedor,
   en ese orden. Sin migración y sin tocar el restaurante.

   ── LA REGLA QUE NO SE PUEDE SALTAR ─────────────────────────
   Un restaurante NO se puede quedar sin ningún dueño. Ni quitando al
   último ni bajándolo de rango. No es burocracia: un local sin dueño
   sigue funcionando y facturando, pero nadie puede entrar a su panel —y
   desde fuera no se nota hasta que alguien lo necesita—. Por eso el
   orden del traspaso es «primero el nuevo, después el viejo», y la
   acción lo dice cuando se intenta al revés.

   ── QUITAR NO ES BORRAR ─────────────────────────────────────
   `revokeMembership` retira el acceso A ESTE LOCAL y nada más: nunca
   toca la cuenta de Auth. Esa cuenta puede ser la de un dueño con tres
   restaurantes, y borrarla desde la ficha de uno lo dejaría fuera de
   los tres. Borrar la cuenta entera vive en la ficha de la persona.
   ============================================================ */

import { revalidatePath } from 'next/cache';
import { currentSuperAdmin, type SuperAdminSession } from '@/lib/auth/super-admin-guard';
import { logSuper } from '@/lib/super-admin-log';
import { findAccountIdByEmail, getAccountById } from '@/lib/db/accounts';
import { LEGACY_ROLE, type MemberRole } from '@/lib/membership-roles';
import { dejariaSinDueño } from '@/lib/membership-rules';

export type MembershipState = { error: string } | { ok: string } | null;

const ROLES: MemberRole[] = ['OWNER', 'MANAGER', 'STAFF', 'WAITER'];

function leerRol(raw: unknown): MemberRole | null {
  return ROLES.includes(raw as MemberRole) ? (raw as MemberRole) : null;
}

/**
 * ¿Quedaría el local sin ningún dueño si esta persona deja de serlo?
 *
 * Lee quiénes son y deja la decisión en `dejariaSinDueño`, que está aparte
 * y con pruebas: es la regla de esta fase que puede fallar en silencio.
 */
async function seQuedaSinDueño(
  db: SuperAdminSession['db'],
  restaurantId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await db
    .from('restaurant_members')
    .select('user_id')
    .eq('restaurant_id', restaurantId)
    .eq('role', 'OWNER')
    .eq('status', 'active');

  return dejariaSinDueño((data ?? []).map((m) => m.user_id as string), userId);
}

/* ── Dar acceso a alguien que YA tiene cuenta ───────────────── */

export async function grantMembership(
  prevState: MembershipState,
  formData: FormData,
): Promise<MembershipState> {
  const sesion = await currentSuperAdmin();
  if (!sesion) return { error: 'No autorizado.' };
  const { db } = sesion;

  const restaurantId = (formData.get('restaurantId') as string)?.trim();
  const email = (formData.get('email') as string)?.trim().toLowerCase() ?? '';
  const role = leerRol(formData.get('role'));

  if (!restaurantId) return { error: 'Restaurante inválido.' };
  if (!role) return { error: 'Elige un papel.' };
  if (!email) return { error: 'Escribe el correo de la persona.' };

  const userId = await findAccountIdByEmail(email);
  if (!userId) {
    return {
      error: `No hay ninguna cuenta de Leogin con ${email}. Si es alguien nuevo, créale un acceso aquí abajo; si ya se registró, revisa el correo en la sección Cuentas.`,
    };
  }

  const detalle = await getAccountById(userId);
  if (detalle.estado !== 'ok') return { error: 'No se pudo leer esa cuenta.' };
  const cuenta = detalle.cuenta;

  // Mismo candado que el resto del panel: al super admin no se le dan ni se
  // le quitan papeles desde aquí.
  if (cuenta.role === 'SUPER_ADMIN') return { error: 'No autorizado.' };

  // Una credencial de turno pertenece al local donde se creó y su correo lo
  // dice; prestarla a otro restaurante rompe la lectura de `usuario@slug`.
  if (cuenta.esPin) {
    return { error: 'Es una credencial de acceso por PIN: pertenece a su local y no se puede mover.' };
  }

  if (cuenta.locales.some((l) => l.restaurantId === restaurantId && !l.legacy)) {
    return { error: `${email} ya tiene acceso a este restaurante.` };
  }

  const { error } = await db
    .from('restaurant_members')
    .upsert(
      { user_id: userId, restaurant_id: restaurantId, role, status: 'active' },
      { onConflict: 'user_id,restaurant_id' },
    );
  if (error) return { error: error.message };

  await logSuper(sesion, {
    action: 'acceso.dar',
    targetUserId: userId,
    targetRestaurantId: restaurantId,
    targetLabel: email,
    meta: { rol: role },
  });

  revalidatePath(`/super/restaurantes/${restaurantId}`, 'layout');
  revalidatePath(`/super/cuentas/${userId}`);
  return { ok: `${email} ya administra este restaurante.` };
}

/* ── Cambiar el papel de alguien ────────────────────────────── */

export async function changeMembershipRole(
  prevState: MembershipState,
  formData: FormData,
): Promise<MembershipState> {
  const sesion = await currentSuperAdmin();
  if (!sesion) return { error: 'No autorizado.' };
  const { db } = sesion;

  const restaurantId = (formData.get('restaurantId') as string)?.trim();
  const userId = (formData.get('userId') as string)?.trim();
  const role = leerRol(formData.get('role'));
  if (!restaurantId || !userId) return { error: 'Datos incompletos.' };
  if (!role) return { error: 'Papel inválido.' };

  const detalle = await getAccountById(userId);
  if (detalle.estado !== 'ok') return { error: 'Esa cuenta ya no existe.' };
  if (detalle.cuenta.role === 'SUPER_ADMIN') return { error: 'No autorizado.' };

  const actual = detalle.cuenta.locales.find((l) => l.restaurantId === restaurantId && !l.legacy);
  if (!actual) return { error: 'Esta persona no tiene membresía en este restaurante.' };
  if (actual.role === role) return { error: 'Ya tiene ese papel.' };

  // Bajar de rango al único dueño deja el local sin dueño igual que quitarlo.
  if (actual.role === 'OWNER' && role !== 'OWNER' && (await seQuedaSinDueño(db, restaurantId, userId))) {
    return {
      error: 'Es la única persona dueña de este restaurante. Nombra dueño a otra antes de bajarle el papel.',
    };
  }

  const { error } = await db
    .from('restaurant_members')
    .update({ role })
    .eq('user_id', userId)
    .eq('restaurant_id', restaurantId);
  if (error) return { error: error.message };

  // El rol del PERFIL es el que miran las pantallas del camino viejo. Se
  // mantiene alineado solo cuando este es su restaurante de casa: si tiene
  // otros, su perfil apunta a otro local y pisarlo sería contestar por un
  // negocio que no es este.
  const { data: perfil } = await db.from('profiles').select('restaurant_id').eq('id', userId).maybeSingle();
  if ((perfil?.restaurant_id as string | null) === restaurantId) {
    await db.from('profiles').update({ role: LEGACY_ROLE[role] }).eq('id', userId);
  }

  await logSuper(sesion, {
    action: 'acceso.rol',
    targetUserId: userId,
    targetRestaurantId: restaurantId,
    targetLabel: detalle.cuenta.email,
    meta: { antes: actual.role, despues: role },
  });

  revalidatePath(`/super/restaurantes/${restaurantId}`, 'layout');
  revalidatePath(`/super/cuentas/${userId}`);
  return { ok: 'Papel actualizado.' };
}

/* ── Quitar el acceso a ESTE local ──────────────────────────── */

export async function revokeMembership(formData: FormData) {
  const sesion = await currentSuperAdmin();
  if (!sesion) return;
  const { db } = sesion;

  const restaurantId = (formData.get('restaurantId') as string)?.trim();
  const userId = (formData.get('userId') as string)?.trim();
  if (!restaurantId || !userId) return;

  const detalle = await getAccountById(userId);
  if (detalle.estado !== 'ok') return;
  if (detalle.cuenta.role === 'SUPER_ADMIN') return;

  if (await seQuedaSinDueño(db, restaurantId, userId)) return;

  await db
    .from('restaurant_members')
    .delete()
    .eq('user_id', userId)
    .eq('restaurant_id', restaurantId);

  // Y el puntero del camino viejo, si apuntaba aquí: dejarlo puesto le
  // devolvería el acceso por la otra puerta, que es la que siguen mirando
  // el candado de tenant y el destino del login.
  const { data: perfil } = await db.from('profiles').select('restaurant_id').eq('id', userId).maybeSingle();
  if ((perfil?.restaurant_id as string | null) === restaurantId) {
    await db.from('profiles').update({ restaurant_id: null }).eq('id', userId);
  }

  await logSuper(sesion, {
    action: 'acceso.quitar',
    targetUserId: userId,
    targetRestaurantId: restaurantId,
    targetLabel: detalle.cuenta.email,
  });

  revalidatePath(`/super/restaurantes/${restaurantId}`, 'layout');
  revalidatePath(`/super/cuentas/${userId}`);
}
