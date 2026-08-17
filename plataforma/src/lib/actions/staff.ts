'use server';

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
import { SYNTHETIC_EMAIL_DOMAIN, isSyntheticStaffEmail } from '@/lib/staff-email';
import { rateLimit } from '@/lib/rate-limit';
import { logActivity } from '@/lib/activity';
import { isValidPin, newPinSalt, hashPin, PIN_LENGTH } from '@/lib/staff-pin-crypto';

/** Email interno autogenerado por miembro de staff — nunca se le pide al
    dueño ni se le muestra a la persona: solo satisface el requisito de
    Supabase Auth de tener un identificador. El PIN es la credencial real. */
function syntheticStaffEmail(): string {
  return `staff-${crypto.randomBytes(12).toString('hex')}${SYNTHETIC_EMAIL_DOMAIN}`;
}

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

type Ctx = { db: ReturnType<typeof createServiceClient>; restaurantId: string; userId: string };

/** Solo el DUEÑO (o super admin) gestiona personal. */
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

  const isSuper = profile.role === 'SUPER_ADMIN';
  if (!isSuper && profile.role !== 'RESTAURANT_OWNER') return null;

  const restaurantId = isSuper ? (restaurantIdFromForm ?? '') : (profile.restaurant_id ?? '');
  if (!restaurantId) return null;

  return { db: createServiceClient(), restaurantId, userId: user.id };
}

export type StaffMember = {
  id: string;
  /** Su correo REAL, o null si entra por PIN (el interno nunca sale de aquí). */
  email: string | null;
  full_name: string | null;
  permissions: string[] | null;
  /** Cómo entra: 'pin' en el aparato del local, 'email' desde donde sea. */
  access: 'pin' | 'email';
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
      return {
        id: p.id as string,
        email: synthetic ? null : rawEmail,
        full_name: (p.full_name as string | null) ?? null,
        permissions: perms,
        access: synthetic ? ('pin' as const) : ('email' as const),
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
  const byEmail = (formData.get('access_type') as string | null) === 'email';

  if (permissions.length === 0) return { error: 'Marca al menos una sección de acceso.' };

  let email: string;
  let password: string;

  if (byEmail) {
    email = ((formData.get('email') as string) ?? '').trim().toLowerCase();
    password = (formData.get('password') as string) ?? '';
    if (!validEmail(email)) return { error: 'Escribe un correo válido para esta persona.' };
    if (isSyntheticStaffEmail(email)) return { error: 'Ese correo no es válido.' };
    if (password.length < 8) return { error: 'La contraseña temporal debe tener al menos 8 caracteres.' };

    // Techo por restaurante: crear un gerente OCUPA ese correo en todo Leogin
    // (auth.users es único por correo), así que en teoría un dueño podría ir
    // apartando correos ajenos de uno en uno. Nadie da de alta 20 encargados
    // en una hora; quien lo intente se topa con esto. El arreglo de fondo es
    // la invitación por correo —que la acepta la persona, no el dueño— y está
    // anotada como Fase 2 en PLAN_ACCESO_MULTICUENTA.md.
    if (!(await rateLimit(`staff-email:${ctx.restaurantId}`, 20, 60 * 60_000))) {
      return { error: 'Has creado varios accesos por correo seguidos. Espera un rato antes de agregar otro.' };
    }
  } else {
    if (!isValidPin(pin)) return { error: `El PIN debe tener ${PIN_LENGTH} dígitos.` };
    email = syntheticStaffEmail();
    password = crypto.randomBytes(24).toString('base64url');
  }

  const { data: created, error: createErr } = await ctx.db.auth.admin.createUser({
    // Nace confirmado a propósito: puede entrar de una, y habilita que después
    // use "Continuar con Google" con ese mismo correo sin duplicar la cuenta.
    email, password, email_confirm: true, user_metadata: { full_name: fullName },
  });
  if (createErr || !created?.user) {
    const m = createErr?.message?.toLowerCase() ?? '';
    if (byEmail && (m.includes('already') || m.includes('registered') || m.includes('exists'))) {
      return { error: 'Ya existe una cuenta de Leogin con ese correo. Usa otro correo para esta persona.' };
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

  // Solo quien entra por PIN recibe PIN. Un gerente con correo NO aparece en
  // la grilla "¿Quién eres?" del local, que es justo lo que se busca: su
  // credencial es suya y no está a la vista de todo el que abra el login.
  // (El dueño puede darle un PIN después desde la ficha, si además atiende
  // caja.)
  if (!byEmail) {
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

  await logActivity({ restaurantId: ctx.restaurantId, actorId: ctx.userId, action: 'staff', entity: fullName ?? 'Sin nombre', meta: { added: true, role: 'RESTAURANT_STAFF', permissions, access: byEmail ? 'email' : 'pin' } });
  revalidatePath('/admin/personal');
  return { ok: true };
}

/** Solo permite operar sobre STAFF/WAITER de ESTE restaurante. */
export async function assertStaffOfRestaurant(ctx: Ctx, userId: string): Promise<boolean> {
  const { data } = await ctx.db.from('profiles').select('role, restaurant_id').eq('id', userId).single();
  return !!data
    && (data.role === 'RESTAURANT_STAFF' || data.role === 'RESTAURANT_WAITER')
    && data.restaurant_id === ctx.restaurantId;
}

export async function updateStaffPermissions(prevState: StaffState, formData: FormData): Promise<StaffState> {
  const ctx = await ownerCtx(formData.get('restaurantId') as string | null);
  if (!ctx) return { error: 'No autorizado.' };

  const userId = (formData.get('userId') as string)?.trim();
  if (!userId || !(await assertStaffOfRestaurant(ctx, userId))) return { error: 'No autorizado.' };

  const fullName = (formData.get('full_name') as string)?.trim() || null;
  const permissions = readPermissions(formData);
  if (permissions.length === 0) return { error: 'Marca al menos una sección de acceso.' };

  // Si era un mesero del rol deprecado, lo normalizamos a STAFF al editarlo.
  const { error } = await ctx.db.from('profiles')
    .update({ permissions, full_name: fullName, role: 'RESTAURANT_STAFF' })
    .eq('id', userId);
  if (error) return { error: error.message };

  revalidatePath('/admin/personal');
  return { ok: true };
}

export async function removeStaff(formData: FormData) {
  const ctx = await ownerCtx(formData.get('restaurantId') as string | null);
  if (!ctx) return;
  const userId = (formData.get('userId') as string)?.trim();
  if (!userId || !(await assertStaffOfRestaurant(ctx, userId))) return;
  await ctx.db.auth.admin.deleteUser(userId); // el profile cae por FK cascade
  await logActivity({ restaurantId: ctx.restaurantId, actorId: ctx.userId, action: 'staff', entity: userId, meta: { removed: true } });
  revalidatePath('/admin/personal');
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
