'use server';

/* ============================================================
   INVITACIONES — invitar, revocar, aceptar (migración 114)
   ------------------------------------------------------------
   Reemplaza al "créale la cuenta y pásale la contraseña": la cuenta la crea
   —o la reusa— quien acepta. Ver lib/auth/invitations.ts para el token.
   ============================================================ */

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { ownerCtx } from '@/lib/actions/staff';
import { logActivity } from '@/lib/activity';
import { STAFF_ASSIGNABLE } from '@/lib/permissions';
import { isSyntheticStaffEmail } from '@/lib/staff-email';
import { adminUrl } from '@/lib/tenant';
import {
  newInviteToken, hashInviteToken, inviteUrl, sendInvitationEmail, INVITE_TTL_MS,
} from '@/lib/auth/invitations';

const UUID_RE = /^[0-9a-f-]{36}$/i;

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/* ── Invitar ─────────────────────────────────────────────────── */

export type InviteState =
  | { error: string }
  /** `url` se enseña siempre: sin correo configurado es la única vía. */
  | { ok: true; sent: boolean; url: string }
  | null;

/**
 * Invita a alguien al equipo de este restaurante.
 *
 * Solo el DUEÑO invita por correo. Un gerente puede dar de alta a su equipo
 * con PIN (ver createStaff) pero no crear pares suyos — la misma regla
 * anti-escalación de siempre, aquí también.
 */
export async function inviteToTeam(prevState: InviteState, formData: FormData): Promise<InviteState> {
  const ctx = await ownerCtx(formData.get('restaurantId') as string | null);
  if (!ctx) return { error: 'No autorizado.' };
  if (ctx.as !== 'OWNER') {
    return { error: 'Solo el dueño puede invitar por correo. Da de alta a tu equipo con un PIN.' };
  }

  const email = ((formData.get('email') as string) ?? '').trim().toLowerCase();
  const rawRole = (formData.get('role') as string | null) ?? 'MANAGER';
  const role = rawRole === 'STAFF' || rawRole === 'WAITER' ? rawRole : 'MANAGER';
  const permissions = formData.getAll('permissions')
    .map(String)
    .filter((s) => (STAFF_ASSIGNABLE as string[]).includes(s));

  if (!validEmail(email)) return { error: 'Escribe un correo válido.' };
  if (isSyntheticStaffEmail(email)) return { error: 'Ese correo no es válido.' };
  if (permissions.length === 0) return { error: 'Marca al menos una sección de acceso.' };

  // Techo por restaurante: invitar es mandar correo a una dirección que
  // escribe otra persona. Sin límite, la pantalla sería un buzón de spam con
  // la marca de Leogin encima.
  if (!(await rateLimit(`invite:${ctx.restaurantId}`, 20, 60 * 60_000))) {
    return { error: 'Has enviado varias invitaciones seguidas. Espera un rato antes de la siguiente.' };
  }

  // ¿Ya está en el equipo? Invitarla otra vez no rompe nada, pero decirlo
  // ahorra la llamada de "le mandé la invitación y no le llega".
  const existingUserId = await findUserIdByEmail(email);
  if (existingUserId) {
    const { data: already } = await ctx.db
      .from('restaurant_members')
      .select('user_id')
      .eq('restaurant_id', ctx.restaurantId)
      .eq('user_id', existingUserId)
      .maybeSingle();
    if (already) return { error: 'Esa persona ya es parte de tu equipo.' };
  }

  const { token, hash } = newInviteToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();

  // Una invitación viva por correo y restaurante (índice único parcial de la
  // migración 114): reinvitar sustituye la anterior en vez de dejar dos
  // enlaces válidos sueltos.
  await ctx.db
    .from('restaurant_invitations')
    .delete()
    .eq('restaurant_id', ctx.restaurantId)
    .eq('email', email)
    .is('accepted_at', null);

  const { error } = await ctx.db.from('restaurant_invitations').insert({
    restaurant_id: ctx.restaurantId,
    email,
    role,
    permissions,
    token_hash: hash,
    invited_by: ctx.userId,
    expires_at: expiresAt,
  });
  if (error) return { error: error.message };

  const [{ data: rest }, { data: inviter }] = await Promise.all([
    ctx.db.from('restaurants').select('name').eq('id', ctx.restaurantId).maybeSingle(),
    ctx.db.from('profiles').select('full_name').eq('id', ctx.userId).maybeSingle(),
  ]);

  const { sent } = await sendInvitationEmail({
    to: email,
    token,
    restaurantName: (rest?.name as string | null) ?? 'tu restaurante',
    inviterName: (inviter?.full_name as string | null) ?? null,
    role,
  });

  await logActivity({
    restaurantId: ctx.restaurantId,
    actorId: ctx.userId,
    action: 'staff',
    entity: email,
    meta: { invited: true, role },
  });
  revalidatePath('/admin/personal');

  // El enlace se devuelve SIEMPRE, mandara correo o no: es lo que permite
  // seguir trabajando el día que el proveedor falle, y lo único que funciona
  // mientras RESEND_API_KEY no esté puesta.
  return { ok: true, sent, url: inviteUrl(token) };
}

/** Cancela una invitación que todavía no se aceptó. */
export async function revokeInvitation(formData: FormData) {
  const ctx = await ownerCtx(formData.get('restaurantId') as string | null);
  if (!ctx || ctx.as !== 'OWNER') return;

  const id = ((formData.get('invitationId') as string) ?? '').trim();
  if (!UUID_RE.test(id)) return;

  await ctx.db
    .from('restaurant_invitations')
    .delete()
    .eq('id', id)
    .eq('restaurant_id', ctx.restaurantId)
    .is('accepted_at', null);

  revalidatePath('/admin/personal');
}

/* ── Aceptar ─────────────────────────────────────────────────── */

export type InvitationInfo = {
  restaurantId: string;
  restaurantName: string;
  restaurantSlug: string;
  email: string;
  role: string;
  permissions: string[] | null;
};

export type InviteLookup =
  | { ok: true; invitation: InvitationInfo }
  | { ok: false; reason: 'unknown' | 'expired' | 'used' };

/**
 * Lee una invitación por su token. Sin efectos: la usa la página para pintar
 * "te invitaron a X" antes de que la persona decida nada.
 */
export async function lookupInvitation(token: string): Promise<InviteLookup> {
  if (!token || token.length < 20) return { ok: false, reason: 'unknown' };

  const db = createServiceClient();
  const { data } = await db
    .from('restaurant_invitations')
    .select('restaurant_id, email, role, permissions, expires_at, accepted_at')
    .eq('token_hash', hashInviteToken(token))
    .maybeSingle();

  if (!data) return { ok: false, reason: 'unknown' };
  if (data.accepted_at) return { ok: false, reason: 'used' };
  if (new Date(data.expires_at as string).getTime() < Date.now()) return { ok: false, reason: 'expired' };

  const { data: rest } = await db
    .from('restaurants')
    .select('name, slug')
    .eq('id', data.restaurant_id as string)
    .maybeSingle();
  if (!rest) return { ok: false, reason: 'unknown' };

  return {
    ok: true,
    invitation: {
      restaurantId: data.restaurant_id as string,
      restaurantName: rest.name as string,
      restaurantSlug: rest.slug as string,
      email: data.email as string,
      role: data.role as string,
      permissions: (data.permissions as string[] | null) ?? null,
    },
  };
}

/**
 * `url` = entra aquí, con una navegación de DOCUMENTO desde el cliente.
 *
 * Antes esto terminaba en `redirect(adminUrl(...))`, y funcionaba solo porque
 * el panel vivía en OTRO host. Con el origen único el destino comparte host
 * con esta página, y ahí Next deja de tratarlo como una salida: lo resuelve
 * por dentro (`getAppRelativeRedirectUrl`, fetch interno) SIN pasar por el
 * proxy — o sea, sin la reescritura de `/panel/<slug>` ni el `x-tenant-slug`.
 * Es la misma trampa que se midió el 2026-08-26 con `enterRestaurant`.
 */
export type AcceptState = { error: string } | { url: string } | null;

/**
 * Acepta la invitación y entra.
 *
 * Tres caminos, y los tres terminan igual (membresía + sesión abierta):
 *  · ya hay sesión con ESE correo → solo se añade la membresía;
 *  · ya existe cuenta con ese correo pero sin sesión → se pide su contraseña;
 *  · no existe cuenta → se crea con la contraseña que elige la persona.
 *
 * La regla que lo sostiene todo: la invitación es PARA UN CORREO. Quien la
 * acepta entra con ese mismo correo — si no, reenviar el enlace regalaría el
 * acceso al restaurante.
 */
export async function acceptInvitation(prevState: AcceptState, formData: FormData): Promise<AcceptState> {
  const token = ((formData.get('token') as string) ?? '').trim();
  const password = (formData.get('password') as string) ?? '';
  const fullName = ((formData.get('full_name') as string) ?? '').trim() || null;

  const ip = clientIp(await headers());
  if (!(await rateLimit(`accept-invite:${ip}`, 10, 10 * 60_000))) {
    return { error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' };
  }

  const lookup = await lookupInvitation(token);
  if (!lookup.ok) {
    return {
      error: lookup.reason === 'expired'
        ? 'Esta invitación ya venció. Pídele al dueño que te mande una nueva.'
        : lookup.reason === 'used'
          ? 'Esta invitación ya se usó. Entra con tu correo y contraseña.'
          : 'Esta invitación no es válida.',
    };
  }
  const invitation = lookup.invitation;

  const db = createServiceClient();
  const supabase = await createClient();

  // ¿Ya hay alguien con sesión en este navegador?
  const { data: { user: current } } = await supabase.auth.getUser();
  let userId: string | null = null;

  if (current?.email?.toLowerCase() === invitation.email) {
    // Camino corto: la sesión abierta ES la persona invitada (típico de quien
    // acepta con Google y ya venía logueado).
    userId = current.id;
  } else {
    // Buscar si ese correo ya tiene cuenta en Leogin.
    const existingId = await findUserIdByEmail(invitation.email);

    if (existingId) {
      if (!password) return { error: 'Ya tienes una cuenta de Leogin con ese correo. Escribe tu contraseña para aceptar.' };
      const { error } = await supabase.auth.signInWithPassword({ email: invitation.email, password });
      if (error) return { error: 'Contraseña incorrecta. Si no la recuerdas, usa "Olvidé mi contraseña".' };
      userId = existingId;
    } else {
      if (password.length < 8) return { error: 'Elige una contraseña de al menos 8 caracteres.' };

      const { data: created, error: createErr } = await db.auth.admin.createUser({
        email: invitation.email,
        password,
        // Nace confirmado: acaba de demostrar que tiene acceso a ese buzón
        // abriendo el enlace que le llegó ahí. Y así puede entrar después con
        // "Continuar con Google" usando el mismo correo, sin duplicar cuenta.
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (createErr || !created?.user) {
        return { error: createErr?.message ?? 'No se pudo crear tu cuenta.' };
      }
      userId = created.user.id;

      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: invitation.email,
        password,
      });
      if (signInErr) {
        // La cuenta quedó creada; que no se pueda abrir sesión aquí no es
        // motivo para borrarla — puede entrar por el login normal.
        return { error: 'Tu cuenta quedó creada. Entra desde la pantalla de acceso con tu correo y contraseña.' };
      }
    }
  }

  if (!userId) return { error: 'No se pudo completar la invitación.' };

  // ── Perfil y membresía ─────────────────────────────────────
  // El perfil solo se crea si no existía: a quien ya tiene su propio
  // restaurante NO se le toca su `restaurant_id` de casa. Su acceso a este
  // otro restaurante viaja por la membresía, que es justo para lo que está.
  const { data: existingProfile } = await db
    .from('profiles')
    .select('id, restaurant_id')
    .eq('id', userId)
    .maybeSingle();

  if (!existingProfile) {
    await db.from('profiles').insert({
      id: userId,
      restaurant_id: invitation.restaurantId,
      role: invitation.role === 'WAITER' ? 'RESTAURANT_WAITER' : 'RESTAURANT_STAFF',
      full_name: fullName,
      permissions: invitation.permissions,
      email_verified_at: new Date().toISOString(),
    });
  }

  const { error: memberErr } = await db.from('restaurant_members').upsert({
    user_id: userId,
    restaurant_id: invitation.restaurantId,
    role: invitation.role,
    permissions: invitation.permissions,
    status: 'active',
  });
  if (memberErr) return { error: 'No se pudo completar la invitación. Inténtalo de nuevo.' };

  // Un solo uso: se marca aceptada al final, cuando ya no puede fallar nada.
  await db
    .from('restaurant_invitations')
    .update({ accepted_at: new Date().toISOString() })
    .eq('token_hash', hashInviteToken(token))
    .is('accepted_at', null);

  await logActivity({
    restaurantId: invitation.restaurantId,
    actorId: userId,
    action: 'staff',
    entity: invitation.email,
    meta: { accepted: true, role: invitation.role },
  });

  // Se DEVUELVE la URL en vez de `redirect()` — ver la nota en AcceptState.
  return { url: `${adminUrl(invitation.restaurantSlug)}?welcome=1` };
}

/**
 * Id del usuario de Auth con ese correo, o null.
 *
 * Se pagina a mano porque `listUsers` no filtra por correo. Es la única forma
 * soportada hoy; el tope de páginas evita que un proyecto grande convierta
 * esta comprobación en un bucle eterno.
 */
async function findUserIdByEmail(email: string): Promise<string | null> {
  const db = createServiceClient();
  const target = email.toLowerCase();

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) return null;

    const hit = data.users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
  return null;
}
