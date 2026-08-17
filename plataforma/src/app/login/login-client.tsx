'use client';

import { useActionState, useEffect, useState } from 'react';
import { getDeviceId } from '@/lib/device-id';
import { Glass } from '@/components/glass';
import { LeoginMark } from '@/components/leogin-logo';
import { Icon } from '@/components/icons';
import { login, type AuthState } from '@/lib/actions/auth';
import type { ResumeSession } from '@/lib/auth/resume';
import StaffPinLogin from '@/components/admin/staff-pin-login';
import GoogleStaffButton from '@/components/auth/google-staff-button';

const emptyState: AuthState = null;

interface Props {
  restaurantName: string | null;
  restaurantId?: string | null;
  logoUrl: string | null;
  slug: string | null;
  /** Sesión de personal ya viva en este dominio → "Continuar como {nombre}". */
  resume?: ResumeSession | null;
  /** Hub local (Fase 2 offline) — fallback si el PIN falla por conectividad. */
  hubUrl?: string | null;
  hubToken?: string | null;
  /** ¿Mostrar "Continuar con Google"? (NEXT_PUBLIC_GOOGLE_AUTH_ENABLED). */
  googleEnabled?: boolean;
  /** Volvimos de Google con un fallo — se avisa en vez de dejar la pantalla muda. */
  authError?: boolean;
  /** ¿Puede este aparato usar el PIN? (candado de dispositivos, migración 112). */
  pinAllowed?: boolean;
  /** ¿Es este uno de los aparatos del local? Si lo es, se abre en la grilla. */
  pinTrusted?: boolean;
}

export default function LoginClient({ restaurantName, restaurantId, logoUrl, slug, resume, hubUrl, hubToken, googleEnabled, authError, pinAllowed = true, pinTrusted = false }: Props) {
  // En el aparato del local se abre DIRECTO en la grilla de PIN. Antes había
  // que pulsar "Soy personal del restaurante" antes de ver los nombres, cada
  // vez, todo el día: en el mostrador ese toque se paga quince veces por
  // turno. Quien entra con correo sigue teniendo su formulario a un toque.
  // (Sin `resume`: si el aparato ya trae una sesión viva, "Continuar como…"
  // es el camino más corto y no conviene taparlo con la grilla.)
  const openInPin = pinTrusted && !!restaurantId && !resume;
  const [mode, setMode] = useState<'password' | 'pin'>(openInPin ? 'pin' : 'password');
  const [state, formAction, isPending] = useActionState(login, emptyState);

  // Asegura que este navegador tenga su id de aparato y su cookie espejo. Es
  // lo que permite al servidor reconocerlo en la SIGUIENTE visita (y lo que
  // hace posible que un PIN correcto lo registre solo). Sin esto, la pantalla
  // de login sería el único sitio del sistema donde el aparato no tiene
  // identidad — justo donde hace falta.
  useEffect(() => { getDeviceId(); }, []);

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

  const hasTenant = !!restaurantName;

  return (
    <main
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100svh',
        padding: '24px 16px',
      }}
    >
      <div className="anim-fade-up" style={{ width: '100%', maxWidth: 360 }}>
        {/* Logo / título */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            {hasTenant && logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={slug ? `/api/icon/${slug}` : logoUrl}
                alt={restaurantName ?? ''}
                width={56}
                height={56}
                style={{
                  borderRadius: 14,
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
            ) : (
              <LeoginMark size={40} />
            )}
          </div>

          {hasTenant ? (
            <>
              <p
                className="t-display"
                style={{ fontSize: 22, fontWeight: 700, marginBottom: 2, letterSpacing: '-0.02em' }}
              >
                {restaurantName}
              </p>
              <p className="t-mute" style={{ fontSize: 12 }}>
                by Leogin
              </p>
            </>
          ) : (
            <p
              className="t-display"
              style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}
            >
              Leogin
            </p>
          )}

          <p className="t-mute" style={{ fontSize: 14, marginTop: 6 }}>
            Acceso al panel de administración
          </p>
        </div>

        {resume && (
          <Glass style={{ padding: '18px 20px', marginBottom: 14 }}>
            <a
              href={resume.url}
              className="press btn-accent"
              style={{
                display: 'block',
                width: '100%',
                padding: '13px',
                borderRadius: 'var(--radius-full)',
                fontWeight: 600,
                fontSize: 15,
                textAlign: 'center',
                textDecoration: 'none',
              }}
            >
              Continuar como {resume.name}
            </a>
            <p className="t-mute" style={{ fontSize: 12, textAlign: 'center', marginTop: 10 }}>
              Ya tienes una sesión iniciada — o entra con otra cuenta:
            </p>
          </Glass>
        )}

        {mode === 'pin' && restaurantId ? (
          <StaffPinLogin restaurantId={restaurantId} hubUrl={hubUrl ?? null} hubToken={hubToken ?? null} onBack={() => setMode('password')} />
        ) : (
        <Glass style={{ padding: '28px 24px' }}>
          {authError && (
            <div
              style={{
                padding: '10px 14px', marginBottom: 16,
                borderRadius: 'var(--radius-md)',
                background: 'rgba(220,50,50,0.12)',
                border: '1px solid rgba(220,50,50,0.25)',
                color: '#f87171', fontSize: 13.5,
              }}
            >
              No pudimos completar el acceso con Google. Inténtalo otra vez o entra con tu correo.
            </div>
          )}

          {/* Google va ARRIBA del formulario a propósito: para quien ya creó su
              cuenta así, es un toque contra escribir correo y contraseña, y es
              el orden que espera el mercado (Shopify, Square, Toast). */}
          {googleEnabled && (
            <div style={{ marginBottom: 18 }}>
              <GoogleStaffButton />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18 }}>
                <span style={{ flex: 1, height: 1, background: 'var(--u-hair-2)' }} />
                <span style={{ fontSize: 11.5, color: 'var(--u-text-4)', whiteSpace: 'nowrap' }}>o con tu correo</span>
                <span style={{ flex: 1, height: 1, background: 'var(--u-hair-2)' }} />
              </div>
            </div>
          )}

          <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label
                htmlFor="email"
                style={{
                  fontSize: 12,
                  color: 'var(--u-text-3)',
                  fontWeight: 500,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  display: 'block',
                  marginBottom: 6,
                }}
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                autoFocus
                placeholder="tu@email.com"
                style={inputStyle}
              />
            </div>

            <div>
              <label
                htmlFor="password"
                style={{
                  fontSize: 12,
                  color: 'var(--u-text-3)',
                  fontWeight: 500,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  display: 'block',
                  marginBottom: 6,
                }}
              >
                Contraseña
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                style={inputStyle}
              />
            </div>

            {state?.error && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(220,50,50,0.12)',
                  border: '1px solid rgba(220,50,50,0.25)',
                  color: '#f87171',
                  fontSize: 14,
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
                width: '100%',
                padding: '14px',
                borderRadius: 'var(--radius-full)',
                fontWeight: 600,
                fontSize: 16,
                border: 'none',
                cursor: isPending ? 'not-allowed' : 'pointer',
                opacity: isPending ? 0.7 : 1,
                marginTop: 4,
              }}
            >
              {isPending ? 'Entrando…' : 'Entrar'}
            </button>

            {/* Hasta ahora esta salida no existía: quien olvidaba su
                contraseña tenía que escribir por WhatsApp y esperar a que
                alguien de Leogin se la cambiara a mano. */}
            <a
              href="/admin/recuperar"
              style={{
                fontSize: 12.5, color: 'var(--u-text-3)', textAlign: 'center',
                textDecoration: 'none', marginTop: 2,
              }}
            >
              Olvidé mi contraseña
            </a>
          </form>
        </Glass>
        )}

        {restaurantId && mode === 'password' && pinAllowed && (
          <button
            type="button"
            onClick={() => setMode('pin')}
            className="press"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              width: '100%',
              marginTop: 16,
              padding: '13px 16px',
              borderRadius: 'var(--radius-lg)',
              border: '1.5px solid var(--u-hair-2)',
              background: 'color-mix(in srgb, var(--u-text) 4%, transparent)',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <span
              style={{
                width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                display: 'grid', placeItems: 'center',
                background: 'color-mix(in srgb, var(--brand-accent) 15%, transparent)',
                color: 'var(--brand-accent-ink)',
              }}
            >
              <Icon name="key" size={17} />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--u-text)' }}>
                Soy personal del restaurante
              </span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--u-text-3)', marginTop: 1 }}>
                Toca aquí para entrar con tu PIN
              </span>
            </span>
            <Icon name="chevronRight" size={16} style={{ color: 'var(--u-text-4)', flexShrink: 0 }} />
          </button>
        )}

        {/* Aparato no autorizado, con el candado puesto. Decir POR QUÉ y cuál
            es la salida: un "no puedes entrar" a secas se lee como una avería
            del sistema y termina en una llamada al dueño a media hora pico. */}
        {restaurantId && mode === 'password' && !pinAllowed && (
          <div
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 12,
              width: '100%', marginTop: 16, padding: '13px 16px',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--u-hair-2)',
              background: 'color-mix(in srgb, var(--u-text) 3%, transparent)',
            }}
          >
            <span
              style={{
                width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                display: 'grid', placeItems: 'center',
                background: 'color-mix(in srgb, var(--u-text) 7%, transparent)',
                color: 'var(--u-text-3)',
              }}
            >
              <Icon name="key" size={17} />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: 'var(--u-text-2)' }}>
                El PIN solo funciona en los aparatos del local
              </span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--u-text-3)', marginTop: 2, lineHeight: 1.5 }}>
                Desde aquí entra con tu correo. Si este es un aparato del restaurante,
                pídele al dueño que lo autorice en Personal → Dispositivos.
              </span>
            </span>
          </div>
        )}
      </div>
    </main>
  );
}
