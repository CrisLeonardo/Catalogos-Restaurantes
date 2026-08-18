import 'server-only';

import { createServiceClient } from '@/lib/supabase/service';
import { sendEmail, emailEnabled } from '@/lib/email';
import { rootDomainForUrls } from '@/lib/tenant';
import type { MemberRole } from '@/lib/membership-roles';

export { newInviteToken, hashInviteToken, INVITE_TTL_MS } from '@/lib/invite-token';

/* ============================================================
   INVITACIONES AL EQUIPO (migración 114)
   ------------------------------------------------------------
   Sumar a un gerente ya no es "créale la cuenta y pásale la contraseña por
   WhatsApp". Se le manda un enlace, y la cuenta la crea —o la reusa— QUIEN
   LA ACEPTA, con su propia contraseña o con su Google.

   Aquí vive todo lo que toca al token; el flujo de aceptar está en
   lib/actions/invitations.ts.
   ============================================================ */

/** URL del enlace que se manda por correo. */
export function inviteUrl(token: string): string {
  const root = rootDomainForUrls();
  const proto = root.includes('localhost') || root.startsWith('127.') ? 'http' : 'https';
  return `${proto}://${root}/invitacion/${encodeURIComponent(token)}`;
}

const ROLE_TEXT: Record<string, string> = {
  MANAGER: 'administrar el restaurante',
  STAFF: 'trabajar en el restaurante',
  WAITER: 'tomar pedidos en mesa',
};

/**
 * Manda la invitación. Nunca lanza: si el correo falla, la invitación sigue
 * siendo válida y el dueño puede copiar el enlace a mano — que es justo lo
 * que hace la pantalla cuando `emailEnabled()` es falso.
 */
export async function sendInvitationEmail(input: {
  to: string;
  token: string;
  restaurantName: string;
  inviterName: string | null;
  role: MemberRole | 'MANAGER' | 'STAFF' | 'WAITER';
}): Promise<{ sent: boolean }> {
  if (!emailEnabled()) return { sent: false };

  const who = input.inviterName ? `${input.inviterName} (${input.restaurantName})` : input.restaurantName;
  const what = ROLE_TEXT[input.role] ?? 'trabajar en el restaurante';

  try {
    const result = await sendEmail({
      to: input.to,
      subject: `${input.restaurantName} te invitó a su equipo en Leogin`,
      heading: `Te invitaron a ${input.restaurantName}`,
      body: [
        `${who} te invitó a ${what} desde Leogin.`,
        'Al aceptar creas tu propio acceso: con tu contraseña o con tu cuenta de Google. ' +
        'Nadie más la conoce, y puedes cambiarla cuando quieras.',
      ],
      cta: { label: 'Aceptar la invitación', url: inviteUrl(input.token) },
      note: 'El enlace vence en 7 días y solo funciona una vez. Si no esperabas esta invitación, ignora este correo.',
    });
    return { sent: result.ok };
  } catch {
    return { sent: false };
  }
}

export type PendingInvitation = {
  id: string;
  email: string;
  role: string;
  permissions: string[] | null;
  expiresAt: string;
  expired: boolean;
};

/** Invitaciones sin aceptar de un restaurante, la más reciente primero. */
export async function listPendingInvitations(restaurantId: string): Promise<PendingInvitation[]> {
  try {
    const db = createServiceClient();
    const { data } = await db
      .from('restaurant_invitations')
      .select('id, email, role, permissions, expires_at')
      .eq('restaurant_id', restaurantId)
      .is('accepted_at', null)
      .order('created_at', { ascending: false })
      .limit(30);

    const now = Date.now();
    return (data ?? []).map((i) => ({
      id: i.id as string,
      email: i.email as string,
      role: i.role as string,
      permissions: (i.permissions as string[] | null) ?? null,
      expiresAt: i.expires_at as string,
      expired: new Date(i.expires_at as string).getTime() < now,
    }));
  } catch {
    return []; // migración 114 sin aplicar
  }
}
