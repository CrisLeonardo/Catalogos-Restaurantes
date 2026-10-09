'use server';
import { identidadReciente } from '@/lib/auth/reauth';
import { reauthRequerida } from '@/lib/auth/reauth-policy';

/* ============================================================
   PERSONAL — gestión de staff por el dueño (Fase D)
   El dueño (RESTAURANT_OWNER) crea/edita/quita meseros y cajeros
   de SU restaurante y les asigna permisos por sección.
   Nunca puede tocar a otros dueños ni al super admin.
   ============================================================ */

import crypto from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { revalidatePath } from 'next/cache';
import { STAFF_ASSIGNABLE } from '@/lib/permissions';
import {
  SYNTHETIC_EMAIL_DOMAIN, isSyntheticStaffEmail,
  validateUsername, staffUsernameEmail, parseStaffUsername,
} from '@/lib/staff-email';
import { getMyMembership, resolveOwnRestaurantId, canManageStaff } from '@/lib/db/membership';
import { rateLimit } from '@/lib/rate-limit';
import { logActivity } from '@/lib/activity';
import { isValidPin, newPinSalt, hashPin, PIN_LENGTH } from '@/lib/staff-pin-crypto';
import { isMeseroOnly } from '@/lib/permissions';

/** Email interno autogenerado por miembro de staff — nunca se le pide al
    dueño ni se le muestra a la persona: solo satisface el requisito de
    Supabase Auth de tener un identificador. El PIN es la credencial real. */
function syntheticStaffEmail(): string {
  return `staff-${crypto.randomBytes(12).toString('hex')}${SYNTHETIC_EMAIL_DOMAIN}`;
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

type Ctx = {
  db: ReturnType<typeof createServiceClient>;
  restaurantId: string;
  userId: string;
  /**
   * Quién está administrando el personal, y con cuánto alcance:
   *  · 'OWNER'   → el dueño (o el super admin): puede todo.
   *  · 'MANAGER' → el gerente de esta sucursal: solo personal por PIN, y
   *    nunca por encima de sí mismo (ver assertStaffOfRestaurant).
   */
  as: 'OWNER' | 'MANAGER';
  /** Permisos del gerente: el techo de lo que puede repartir. */
  ownPermissions: string[] | null;
};

/**
 * Quién puede gestionar personal en ESTE restaurante.
 *
 * Antes solo el dueño. Ahora también el gerente de la sucursal, porque no
 * tenía sentido pedirle al dueño de una cadena que diera de alta a mano a los
 * cajeros de cada local — que es exactamente la pregunta que abrió esto.
 *
 * Lo que hace seguro delegarlo son las reglas de `as: 'MANAGER'`, todas
 * comprobadas en el servidor:
 *   1. solo crea personal por PIN, nunca a otro gerente con correo;
 *   2. solo reparte permisos que él mismo tiene;
 *   3. no puede tocarse a sí mismo, ni al dueño, ni a otro gerente;
 *   4. el dueño lo ve todo en la bitácora y puede revertirlo.
 */
export async function ownerCtx(restaurantIdFromForm?: string | null): Promise<Ctx | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('restaurant_id, role')
    .eq('id', user.id)
    .single();
  if (!profile) return null;

  const db = createServiceClient();

  if (profile.role === 'SUPER_ADMIN') {
    const restaurantId = restaurantIdFromForm ?? '';
    if (!restaurantId) return null;
    return { db, restaurantId, userId: user.id, as: 'OWNER', ownPermissions: null };
  }

  // El restaurante sobre el que se actúa sale del subdominio cuando esta
  // persona es miembro de él: su perfil solo apunta a uno y podría ser otro.
  const restaurantId = (await resolveOwnRestaurantId(profile.restaurant_id)) ?? '';
  if (!restaurantId) return null;

  const membership = await getMyMembership(restaurantId);
  if (membership) {
    if (!canManageStaff(membership.role)) return null;
    return {
      db,
      restaurantId,
      userId: user.id,
      as: membership.role === 'OWNER' ? 'OWNER' : 'MANAGER',
      ownPermissions: membership.permissions,
    };
  }

  // Sin membresía: el camino de siempre, solo el dueño.
  if (profile.role !== 'RESTAURANT_OWNER') return null;
  if (profile.restaurant_id !== restaurantId) return null;
  return { db, restaurantId, userId: user.id, as: 'OWNER', ownPermissions: null };
}

export type StaffMember = {
  id: string;
  /** Su correo REAL, o null si entra por PIN o por usuario (el interno nunca
      sale de aquí: no es de nadie y no sirve para entrar tal cual). */
  email: string | null;
  /** Su usuario de ESTE restaurante, si entra así. */
  username: string | null;
  full_name: string | null;
  permissions: string[] | null;
  /**
   * Cómo entra:
   *  · 'pin'   → en el aparato del local, desde "¿Quién eres?";
   *  · 'user'  → usuario y contraseña de este restaurante (el administrador);
   *  · 'email' → con su correo real. Es la forma ANTIGUA: ya no se crean
   *    así, pero las cuentas que existen siguen entrando igual.
   */
  access: 'pin' | 'user' | 'email';
  /**
   * ¿Su ÚNICO trabajo es el piso? (misma regla que usa el resto del sistema
   * para mandarlo a /admin/mesero en vez de al panel).
   *
   * No es lo mismo que "tiene la sección Mesero": un gerente la tiene también
   * —para poder tomar un pedido en mesa cuando hace falta— y llamarlo "Mesero"
   * en la lista del equipo es decirle al dueño lo que esa persona NO es.
   */
  meseroOnly: boolean;
};

async function buildMemberList(
  db: ReturnType<typeof createServiceClient>,
  profiles: { id: unknown; full_name: unknown; permissions: unknown; role: unknown }[],
): Promise<StaffMember[]> {
  return Promise.all(
    profiles.map(async (p) => {
      const { data } = await db.auth.admin.getUserById(p.id as string);
      // Compatibilidad: un mesero del rol deprecado se ve como STAFF con ["mesero"].
      const perms = (p.permissions as string[] | null)
        ?? (p.role === 'RESTAURANT_WAITER' ? ['mesero'] : null);
      // El correo interno (`@staff.leogin.internal`) no se manda al navegador:
      // no es de nadie, no sirve para entrar y enseñárselo al dueño solo
      // confunde ("¿ese es su correo?").
      const rawEmail = data.user?.email ?? null;
      const synthetic = isSyntheticStaffEmail(rawEmail);
      // Dentro de los internos hay dos cosas distintas: el PIN del local
      // (`staff-<azar>@…`) y el usuario del administrador (`u.<id>.<usuario>@…`).
      // Al dueño le importa la diferencia: uno se teclea en la tableta y el
      // otro se dicta por WhatsApp.
      const asUser = parseStaffUsername(rawEmail);
      return {
        id: p.id as string,
        email: synthetic ? null : rawEmail,
        username: asUser?.username ?? null,
        full_name: (p.full_name as string | null) ?? null,
        permissions: perms,
        access: asUser ? ('user' as const) : synthetic ? ('pin' as const) : ('email' as const),
        // Se decide AQUÍ, donde se conoce el rol real del perfil; el navegador
        // solo recibe la respuesta.
        meseroOnly: isMeseroOnly(p.role as string | null, perms),
      };
    }),
  );
}

export async function listStaff(restaurantId: string): Promise<StaffMember[]> {
  if (!UUID_RE.test(restaurantId)) return [];
  const db = createServiceClient();
  const { data: profiles } = await db
    .from('profiles')
    .select('id, full_name, permissions, role')
    .eq('restaurant_id', restaurantId)
    .in('role', ['RESTAURANT_STAFF', 'RESTAURANT_WAITER']);

  if (!profiles?.length) return [];
  return buildMemberList(db, profiles as { id: unknown; full_name: unknown; permissions: unknown; role: unknown }[]);
}

/** Lee y valida las secciones marcadas en el form. */
function readPermissions(formData: FormData): string[] {
  return formData.getAll('permissions')
    .map(String)
    .filter((s) => (STAFF_ASSIGNABLE as string[]).includes(s));
}

export type StaffState = { error: string } | { ok: true } | null;

/**
 * Crea un miembro de personal, con UNA de estas dos credenciales:
 *
 *  · PIN (por defecto) — cajeros, cocina, meseros. Entran en el aparato del
 *    local desde "¿Quién eres?". Por debajo se les crea una cuenta de Supabase
 *    Auth con un email sintético + contraseña aleatoria que nadie usa: es un
 *    detalle interno para que profiles.id siga siendo un auth.users(id) real,
 *    no una credencial que la persona teclee.
 *
 *  · CORREO — el gerente/encargado de la sucursal. Entra desde donde sea, a
 *    cualquier hora, con SU correo y contraseña (o con Google, usando ese
 *    mismo correo: Supabase enlaza la identidad porque el correo nace
 *    confirmado). Antes esto no existía y las dos únicas salidas eran malas:
 *    darle la contraseña del dueño —con acceso al cobro de todo el negocio— o
 *    darle un PIN de personal, con el que no puede revisar el cierre desde su
 *    casa.
 *
 * Lo que un gerente NO puede sigue estando garantizado por los permisos: la
 * gestión de personal ('personal') no es una sección delegable —solo el dueño
 * la tiene— y 'suscripcion' se deja fuera de su plantilla, así que no toca el
 * cobro ni puede darse permisos a sí mismo.
 */
export async function createStaff(prevState: StaffState, formData: FormData): Promise<StaffState> {
  const ctx = await ownerCtx(formData.get('restaurantId') as string | null);
  if (!ctx) return { error: 'No autorizado.' };

  const fullName = (formData.get('full_name') as string)?.trim() || null;
  const pin = (formData.get('pin') as string) ?? '';
  const permissions = readPermissions(formData);
  // Cómo va a entrar: con el PIN del aparato del local, o con un USUARIO y
  // contraseña de este restaurante (el administrador que entra desde donde
  // sea). Cualquier valor que no sea 'pin' se trata como usuario.
  const byUser = (formData.get('access_type') as string | null) !== 'pin';

  if (permissions.length === 0) return { error: 'Marca al menos una sección de acceso.' };

  // ── Techo del gerente ──────────────────────────────────────
  // Un gerente da de alta al equipo de SU sucursal, no crea pares suyos ni
  // reparte accesos que él no tiene. Sin esto, delegar la gestión de personal
  // sería delegar la capacidad de ascenderse.
  if (ctx.as === 'MANAGER') {
    if (byUser) {
      return { error: 'Solo el dueño puede crear accesos de administrador. Da de alta a tu equipo con un PIN.' };
    }
    const ceiling = ctx.ownPermissions;
    if (ceiling && permissions.some((p) => !ceiling.includes(p))) {
      return { error: 'No puedes dar acceso a secciones que tú no tienes.' };
    }
  }

  let email: string;
  let password: string;

  if (byUser) {
    const username = ((formData.get('username') as string) ?? '').trim().toLowerCase();
    const badUser = validateUsername(username);
    if (badUser) return { error: badUser };

    password = (formData.get('password') as string) ?? '';
    if (password.length < 8) return { error: 'La contraseña debe tener al menos 8 caracteres.' };

    // El usuario es de ESTE restaurante: dos locales pueden tener su propio
    // `carlos` sin enterarse el uno del otro, y dar de alta a alguien ya no
    // ocupa un correo real en toda la plataforma (ver lib/staff-email.ts).
    email = staffUsernameEmail(ctx.restaurantId, username);

    // Nadie da de alta 20 administradores en una hora: esto solo frena un
    // formulario disparado en bucle.
    if (!(await rateLimit(`staff-user:${ctx.restaurantId}`, 20, 60 * 60_000))) {
      return { error: 'Has creado varios accesos seguidos. Espera un rato antes de agregar otro.' };
    }
  } else {
    if (!isValidPin(pin)) return { error: `El PIN debe tener ${PIN_LENGTH} dígitos.` };
    email = syntheticStaffEmail();
    password = crypto.randomBytes(24).toString('base64url');
  }

  const { data: created, error: createErr } = await ctx.db.auth.admin.createUser({
    // Nace confirmado a propósito: el correo interno no existe y no hay nada
    // que confirmar — sin esto la cuenta se quedaría esperando un enlace que
    // nadie va a recibir nunca.
    email, password, email_confirm: true, user_metadata: { full_name: fullName },
    // ACC-05: la contraseña la eligió el dueño; el administrador la cambia por
    // una suya al primer ingreso. Las cuentas de PIN no tienen contraseña.
    ...(byUser ? { app_metadata: { debe_cambiar_contrasena: true } } : {}),
  });
  if (createErr || !created?.user) {
    const m = createErr?.message?.toLowerCase() ?? '';
    if (byUser && (m.includes('already') || m.includes('registered') || m.includes('exists'))) {
      return { error: 'Ya hay alguien con ese usuario en este restaurante. Elige otro.' };
    }
    return { error: createErr?.message ?? 'No se pudo crear el miembro.' };
  }

  const { error: profErr } = await ctx.db.from('profiles').upsert({
    id: created.user.id,
    restaurant_id: ctx.restaurantId,
    role: 'RESTAURANT_STAFF',
    full_name: fullName,
    permissions,
  });
  if (profErr) {
    await ctx.db.auth.admin.deleteUser(created.user.id);
    return { error: profErr.message };
  }

  // Membresía (migración 113): quien entra con correo es gerente de esta
  // sucursal; quien entra con PIN es personal. Se mantiene en paralelo con el
  // perfil de arriba mientras conviven los dos modelos.
  await ctx.db.from('restaurant_members').insert({
    user_id: created.user.id,
    restaurant_id: ctx.restaurantId,
    role: byUser ? 'MANAGER' : 'STAFF',
    permissions,
    status: 'active',
    invited_by: ctx.userId,
  });

  // Solo quien entra por PIN recibe PIN. Un administrador con usuario NO
  // aparece en la grilla "¿Quién eres?" del local, que es justo lo que se
  // busca: su credencial no está a la vista de todo el que abra el login.
  // (El dueño puede darle un PIN después desde la ficha, si además atiende
  // caja.)
  if (!byUser) {
    const salt = newPinSalt();
    const pinHash = await hashPin(pin, salt);
    const { error: pinErr } = await ctx.db.from('staff_pins').insert({
      profile_id: created.user.id,
      restaurant_id: ctx.restaurantId,
      pin_hash: pinHash,
      pin_salt: salt,
    });
    if (pinErr) {
      await ctx.db.auth.admin.deleteUser(created.user.id); // el profile cae por FK cascade
      return { error: pinErr.message };
    }
  }

  await logActivity({ restaurantId: ctx.restaurantId, actorId: ctx.userId, action: 'staff', entity: fullName ?? 'Sin nombre', meta: { added: true, role: 'RESTAURANT_STAFF', permissions, access: byUser ? 'user' : 'pin' } });
  revalidatePath('/admin/personal');
  return { ok: true };
}

/**
 * Solo permite operar sobre STAFF/WAITER de ESTE restaurante.
 *
 * Y, si quien administra es un GERENTE, además: nunca sobre sí mismo ni sobre
 * otro gerente. Sin esa segunda regla, un gerente podía ponerle un PIN a otro
 * gerente y entrar como él — escalar de "gerente de la sucursal" a "cualquier
 * gerente" sin tocar nada más. La comprobación va contra la MEMBRESÍA porque
 * el rol de perfil de un gerente es RESTAURANT_STAFF, igual que el de un
 * cajero: por ahí no se distinguen.
 */
export async function assertStaffOfRestaurant(ctx: Ctx, userId: string): Promise<boolean> {
  const { data } = await ctx.db.from('profiles').select('role, restaurant_id').eq('id', userId).single();
  const isStaffHere = !!data
    && (data.role === 'RESTAURANT_STAFF' || data.role === 'RESTAURANT_WAITER')
    && data.restaurant_id === ctx.restaurantId;
  if (!isStaffHere) return false;
  if (ctx.as === 'OWNER') return true;

  if (userId === ctx.userId) return false; // no se edita a sí mismo

  const { data: target } = await ctx.db
    .from('restaurant_members')
    .select('role')
    .eq('user_id', userId)
    .eq('restaurant_id', ctx.restaurantId)
    .maybeSingle();
  const targetRole = (target?.role as string | null) ?? 'STAFF';
  return targetRole !== 'OWNER' && targetRole !== 'MANAGER';
}

export async function updateStaffPermissions(prevState: StaffState, formData: FormData): Promise<StaffState> {
  const ctx = await ownerCtx(formData.get('restaurantId') as string | null);
  if (!ctx) return { error: 'No autorizado.' };

  const userId = (formData.get('userId') as string)?.trim();
  if (!userId || !(await assertStaffOfRestaurant(ctx, userId))) return { error: 'No autorizado.' };

  const fullName = (formData.get('full_name') as string)?.trim() || null;
  const permissions = readPermissions(formData);
  if (permissions.length === 0) return { error: 'Marca al menos una sección de acceso.' };

  // Mismo techo que al crear: un gerente no puede ascender a nadie por encima
  // de sí mismo editándolo después.
  if (ctx.as === 'MANAGER' && ctx.ownPermissions) {
    if (permissions.some((p) => !ctx.ownPermissions!.includes(p))) {
      return { error: 'No puedes dar acceso a secciones que tú no tienes.' };
    }
  }

  // Si era un mesero del rol deprecado, lo normalizamos a STAFF al editarlo.
  const { error } = await ctx.db.from('profiles')
    .update({ permissions, full_name: fullName, role: 'RESTAURANT_STAFF' })
    .eq('id', userId);
  if (error) return { error: error.message };

  // Y la membresía, que es de donde leen los candados nuevos. Si las dos vías
  // no se actualizan juntas, alguien podría conservar por una lo que se le
  // acaba de quitar por la otra.
  await ctx.db.from('restaurant_members')
    .update({ permissions })
    .eq('user_id', userId)
    .eq('restaurant_id', ctx.restaurantId);

  revalidatePath('/admin/personal');
  return { ok: true };
}

/**
 * Le pone una contraseña nueva a alguien de su equipo.
 *
 * Es OBLIGATORIO que exista, y no un lujo: un acceso por usuario no tiene
 * correo, así que no hay "olvidé mi contraseña" que valga — el buzón al que
 * se mandaría el enlace no existe. Sin esto, un encargado que olvida su
 * contraseña deja de poder trabajar hasta que le borren la cuenta y le hagan
 * otra, perdiendo sus permisos por el camino.
 *
 * Solo el DUEÑO: la contraseña de un administrador la restablece quien
 * responde por el negocio, no un gerente al de otro gerente.
 */
export async function resetStaffPassword(prevState: StaffState, formData: FormData): Promise<StaffState> {
  const ctx = await ownerCtx(formData.get('restaurantId') as string | null);
  if (!ctx || ctx.as !== 'OWNER') return { error: 'No autorizado.' };

  const userId = (formData.get('userId') as string)?.trim();
  if (!userId || !(await assertStaffOfRestaurant(ctx, userId))) return { error: 'No autorizado.' };
  // ACC-09: delicado → «confirma que eres tú» si hace más de 10 min.
  if (!(await identidadReciente())) return reauthRequerida();

  const password = (formData.get('password') as string) ?? '';
  if (password.length < 8) return { error: 'La contraseña debe tener al menos 8 caracteres.' };

  // ACC-05: la nueva también la elige el dueño → se cambia al entrar.
  const { error } = await ctx.db.auth.admin.updateUserById(userId, {
    password, app_metadata: { debe_cambiar_contrasena: true },
  });
  if (error) return { error: 'No se pudo cambiar la contraseña. Inténtalo de nuevo.' };

  // Queda en la bitácora del dueño: cambiar la credencial de otra persona no
  // es un ajuste cualquiera, y quien la usaba merece que se sepa cuándo pasó.
  await logActivity({
    restaurantId: ctx.restaurantId,
    actorId: ctx.userId,
    action: 'staff',
    entity: userId,
    meta: { password_reset: true },
  });
  revalidatePath('/admin/personal');
  return { ok: true };
}

export async function removeStaff(_prevState: StaffState, formData: FormData): Promise<StaffState> {
  const ctx = await ownerCtx(formData.get('restaurantId') as string | null);
  if (!ctx) return { error: 'No autorizado.' };
  const userId = (formData.get('userId') as string)?.trim();
  if (!userId || !(await assertStaffOfRestaurant(ctx, userId))) return { error: 'No autorizado.' };
  // ACC-09: delicado → «confirma que eres tú» si hace más de 10 min.
  if (!(await identidadReciente())) return reauthRequerida();

  /* El perfil cae en cascada. Antes no se miraba el resultado: si borrar
     fallaba —pasaba con quien había anulado algún pedido, porque
     `order_voids` lo ataba a su perfil hasta la migración 135— la persona
     seguía en el equipo y la bitácora decía que se había quitado. */
  const { error } = await ctx.db.auth.admin.deleteUser(userId);
  if (error) {
    console.error('[removeStaff] no se pudo borrar la cuenta', userId, error.message);
    return { error: 'No se pudo quitar a esta persona del equipo. Inténtalo otra vez; si sigue pasando, escríbenos a soporte.' };
  }
  await logActivity({ restaurantId: ctx.restaurantId, actorId: ctx.userId, action: 'staff', entity: userId, meta: { removed: true } });
  revalidatePath('/admin/personal');
  return { ok: true };
}

/** Lista el personal con permiso "mesero" (toma pedidos en mesa). */
export async function listWaiters(restaurantId: string): Promise<StaffMember[]> {
  if (!UUID_RE.test(restaurantId)) return [];
  const db = createServiceClient();
  const { data: profiles } = await db
    .from('profiles')
    .select('id, full_name, permissions, role')
    .eq('restaurant_id', restaurantId)
    .in('role', ['RESTAURANT_STAFF', 'RESTAURANT_WAITER']);

  const members = await buildMemberList(
    db,
    (profiles ?? []) as { id: unknown; full_name: unknown; permissions: unknown; role: unknown }[],
  );
  return members.filter((m) => m.permissions?.includes('mesero'));
}

/* ── Bitácora de actividad ──────────────────────────────────── */
export type ActivityRow = {
  id: number;
  actor_id: string | null;
  action: string;
  entity: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
  actor_name: string | null;
};

export async function getActivityLog(restaurantId: string, limit = 40): Promise<ActivityRow[]> {
  if (!UUID_RE.test(restaurantId)) return [];
  const db = createServiceClient();
  const { data } = await db
    .from('activity_log')
    .select('id, actor_id, action, entity, meta, created_at')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));

  const rows = (data ?? []) as Omit<ActivityRow, 'actor_name'>[];

  // Resolver nombres de los actores (pocos distintos).
  const actorIds = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))] as string[];
  const names = new Map<string, string | null>();
  if (actorIds.length) {
    const { data: profs } = await db.from('profiles').select('id, full_name').in('id', actorIds);
    for (const p of profs ?? []) names.set(p.id as string, (p.full_name as string | null) ?? null);
  }

  return rows.map((r) => ({ ...r, actor_name: r.actor_id ? names.get(r.actor_id) ?? null : null }));
}
