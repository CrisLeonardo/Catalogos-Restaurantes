'use client';

import { useActionState } from 'react';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import GoogleStaffButton from '@/components/auth/google-staff-button';
import { acceptInvitation, type AcceptState } from '@/lib/actions/invitations';

const ROLE_TEXT: Record<string, string> = {
  MANAGER: 'como gerente',
  STAFF: 'como parte del personal',
  WAITER: 'como mesero',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'color-mix(in srgb, var(--u-text) 5%, transparent)',
  border: '1px solid var(--u-hair-2)',
  borderRadius: 'var(--radius-md)',
  padding: '12px 14px',
  color: 'var(--u-text)',
  fontSize: 16,
  outline: 'none',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11.5, color: 'var(--u-text-3)', fontWeight: 600,
  letterSpacing: '0.04em', textTransform: 'uppercase',
  display: 'block', marginBottom: 6,
};

export default function AcceptInviteClient({
  token, restaurantName, email, role, hasAccount, sessionMatches, sessionEmail, googleEnabled,
}: {
  token: string;
  restaurantName: string;
  email: string;
  role: string;
  /** Ese correo ya tiene cuenta de Leogin → se pide SU contraseña. */
  hasAccount: boolean;
  /** Ya hay sesión abierta con ese mismo correo → un solo botón. */
  sessionMatches: boolean;
  sessionEmail: string | null;
  googleEnabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState<AcceptState, FormData>(acceptInvitation, null);

  return (
    <Glass style={{ padding: '28px 24px' }}>
      <div style={{ textAlign: 'center', marginBottom: 22 }}>
        <span
          style={{
            width: 46, height: 46, borderRadius: 13, display: 'grid', placeItems: 'center',
            margin: '0 auto 14px',
            background: 'color-mix(in srgb, var(--brand-accent) 14%, transparent)',
            color: 'var(--brand-accent-ink)',
          }}
        >
          <Icon name="userPlus" size={21} />
        </span>
        <p className="t-display" style={{ fontSize: 21, fontWeight: 700, margin: 0, lineHeight: 1.2 }}>
          Te invitaron a {restaurantName}
        </p>
        <p className="t-mute" style={{ fontSize: 13.5, margin: '8px 0 0', lineHeight: 1.5 }}>
          Vas a entrar {ROLE_TEXT[role] ?? 'al equipo'} con <strong style={{ color: 'var(--u-text-2)' }}>{email}</strong>.
        </p>
      </div>

      <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
        <input type="hidden" name="token" value={token} />

        {sessionMatches ? (
          /* Ya está identificada: no hay nada que escribir. Es el caso de
             quien abre el enlace con su Google ya abierto en el navegador. */
          <p style={{ fontSize: 13, color: 'var(--u-text-3)', margin: 0, textAlign: 'center', lineHeight: 1.5 }}>
            Ya tienes la sesión iniciada con ese correo. Solo falta aceptar.
          </p>
        ) : (
          <>
            {!hasAccount && (
              <div>
                <label style={labelStyle} htmlFor="full_name">Tu nombre</label>
                <input id="full_name" name="full_name" required placeholder="Tu nombre y apellido" style={inputStyle} />
              </div>
            )}

            <div>
              <label style={labelStyle} htmlFor="password">
                {hasAccount ? 'Tu contraseña de Leogin' : 'Elige tu contraseña'}
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={hasAccount ? undefined : 8}
                autoComplete={hasAccount ? 'current-password' : 'new-password'}
                style={inputStyle}
              />
              <p style={{ fontSize: 11.5, color: 'var(--u-text-4)', margin: '6px 0 0', lineHeight: 1.45 }}>
                {hasAccount
                  ? 'Ya tienes cuenta en Leogin con ese correo: entra con la contraseña de siempre.'
                  : 'Mínimo 8 caracteres. Es tuya: nadie del restaurante la conoce.'}
              </p>
            </div>
          </>
        )}

        {state && 'error' in state && (
          <div
            style={{
              padding: '10px 13px', borderRadius: 'var(--radius-md)',
              background: 'rgba(220,50,50,0.12)', border: '1px solid rgba(220,50,50,0.25)',
              color: 'var(--c-danger)', fontSize: 13, lineHeight: 1.45,
            }}
          >
            {state.error}
          </div>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="press btn-accent"
          style={{
            width: '100%', padding: '13px', borderRadius: 'var(--radius-full)',
            fontWeight: 600, fontSize: 15, border: 'none',
            cursor: isPending ? 'wait' : 'pointer', opacity: isPending ? 0.7 : 1,
          }}
        >
          {isPending ? 'Entrando…' : 'Aceptar y entrar'}
        </button>
      </form>

      {/* Con Google: solo tiene sentido ofrecerlo cuando la sesión actual NO
          es ya la persona invitada. El botón la manda a identificarse y vuelve
          aquí, donde el caso de arriba resuelve el resto con un clic. */}
      {googleEnabled && !sessionMatches && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0' }}>
            <span style={{ flex: 1, height: 1, background: 'var(--u-hair-2)' }} />
            <span style={{ fontSize: 11.5, color: 'var(--u-text-4)', whiteSpace: 'nowrap' }}>o</span>
            <span style={{ flex: 1, height: 1, background: 'var(--u-hair-2)' }} />
          </div>
          <GoogleStaffButton
            intent="signup"
            label="Continuar con Google"
            next={`/invitacion/${encodeURIComponent(token)}`}
          />
          <p style={{ fontSize: 11.5, color: 'var(--u-text-4)', margin: '10px 0 0', textAlign: 'center', lineHeight: 1.45 }}>
            Tiene que ser la cuenta de <strong style={{ color: 'var(--u-text-3)' }}>{email}</strong>:
            la invitación es para ese correo.
          </p>
        </>
      )}

      {sessionEmail && !sessionMatches && (
        <p style={{ fontSize: 11.5, color: 'var(--u-text-4)', margin: '14px 0 0', textAlign: 'center', lineHeight: 1.45 }}>
          Ahora mismo tienes la sesión iniciada como {sessionEmail}. La invitación es para {email}.
        </p>
      )}
    </Glass>
  );
}
