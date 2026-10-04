import type { Metadata } from 'next';
import Link from 'next/link';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import LeoginLogo from '@/components/leogin-logo';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { lookupInvitation } from '@/lib/actions/invitations';
import { isGoogleAuthEnabled } from '@/lib/auth-config';
import AcceptInviteClient from './accept-invite-client';

export const metadata: Metadata = {
  title: 'Invitación — Leogin',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * Aceptar una invitación al equipo de un restaurante (migración 114).
 *
 * La página resuelve TRES cosas antes de pintar, porque de ellas depende qué
 * se le pide a la persona:
 *  · ¿la invitación sirve todavía?
 *  · ¿ese correo ya tiene cuenta de Leogin? → se le pide su contraseña, no
 *    una nueva; si no, se le pide que elija una.
 *  · ¿ya hay sesión abierta con ese mismo correo? → un solo botón, sin nada
 *    que escribir (el caso de quien acepta con Google ya logueado).
 */
export default async function InvitacionPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const lookup = await lookupInvitation(token);

  if (!lookup.ok) {
    const message =
      lookup.reason === 'expired'
        ? 'Esta invitación ya venció. Pídele al dueño del restaurante que te mande una nueva.'
        : lookup.reason === 'used'
          ? 'Esta invitación ya se usó. Si eres tú, entra con tu correo y contraseña.'
          : 'Este enlace de invitación no es válido.';
    return <InviteShell><Notice message={message} /></InviteShell>;
  }

  const invitation = lookup.invitation;

  // ¿Hay ya una sesión, y es de la persona invitada?
  let sessionEmail: string | null = null;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    sessionEmail = user?.email?.toLowerCase() ?? null;
  } catch {
    /* sin sesión utilizable → flujo normal */
  }
  const sessionMatches = sessionEmail === invitation.email;

  // ¿Ese correo ya tiene cuenta? Cambia el texto del campo de contraseña:
  // "tu contraseña de Leogin" no es lo mismo que "elige una contraseña".
  let hasAccount = false;
  try {
    const db = createServiceClient();
    for (let page = 1; page <= 20 && !hasAccount; page += 1) {
      const { data } = await db.auth.admin.listUsers({ page, perPage: 200 });
      if (!data?.users?.length) break;
      hasAccount = data.users.some((u) => u.email?.toLowerCase() === invitation.email);
      if (data.users.length < 200) break;
    }
  } catch {
    /* si no se puede saber, se pide contraseña como cuenta nueva */
  }

  return (
    <InviteShell>
      <AcceptInviteClient
        token={token}
        restaurantName={invitation.restaurantName}
        email={invitation.email}
        role={invitation.role}
        hasAccount={hasAccount}
        sessionMatches={sessionMatches}
        sessionEmail={sessionEmail}
        googleEnabled={isGoogleAuthEnabled()}
      />
    </InviteShell>
  );
}

function InviteShell({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ minHeight: '100svh', display: 'flex', flexDirection: 'column' }}>
      <header
        className="glass-solid"
        style={{
          position: 'sticky', top: 0, zIndex: 50,
          borderRadius: 0, borderLeft: 'none', borderRight: 'none', borderTop: 'none',
          height: 56, padding: '0 18px', display: 'flex', alignItems: 'center',
        }}
      >
        <Link href="/" style={{ textDecoration: 'none' }}><LeoginLogo size={24} /></Link>
      </header>
      <div
        className="anim-fade-up"
        style={{ flex: 1, display: 'grid', placeItems: 'center', padding: '32px 18px 64px' }}
      >
        <div style={{ width: '100%', maxWidth: 400 }}>{children}</div>
      </div>
    </main>
  );
}

function Notice({ message }: { message: string }) {
  return (
    <Glass style={{ padding: '28px 24px', textAlign: 'center' }}>
      <span
        style={{
          width: 44, height: 44, borderRadius: 99, display: 'grid', placeItems: 'center',
          margin: '0 auto 14px', background: 'color-mix(in srgb, var(--u-text) 7%, transparent)',
          color: 'var(--u-text-3)',
        }}
      >
        <Icon name="mail" size={20} />
      </span>
      <p style={{ fontSize: 14, color: 'var(--u-text-2)', lineHeight: 1.55, margin: '0 0 18px' }}>
        {message}
      </p>
      <Link
        href="/login"
        className="press btn-accent"
        style={{
          display: 'inline-block', padding: '11px 22px', borderRadius: 'var(--radius-full)',
          fontWeight: 600, fontSize: 14, textDecoration: 'none',
        }}
      >
        Ir al acceso
      </Link>
    </Glass>
  );
}
