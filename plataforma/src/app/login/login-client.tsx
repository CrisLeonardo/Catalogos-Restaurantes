'use client';

import { useActionState, useEffect, useState, type KeyboardEvent } from 'react';
import { getDeviceId } from '@/lib/device-id';
import { Glass } from '@/components/glass';
import { LeoginMark, LeoginNombre } from '@/components/leogin-logo';
import { Icon } from '@/components/icons';
import { login, logout, type AuthState } from '@/lib/actions/auth';
import type { ResumeSession } from '@/lib/auth/resume';
import StaffPinLogin from '@/components/admin/staff-pin-login';
import GoogleStaffButton from '@/components/auth/google-staff-button';
import s from './login.module.css';

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
  next?: string | null;
}

export default function LoginClient({ restaurantName, restaurantId, logoUrl, slug, resume, hubUrl, hubToken, googleEnabled, authError, pinAllowed = true, pinTrusted = false, next }: Props) {
  // En el aparato del local se abre DIRECTO en la grilla de PIN. Antes había
  // que pulsar "Soy personal del restaurante" antes de ver los nombres, cada
  // vez, todo el día: en el mostrador ese toque se paga quince veces por
  // turno. Quien entra con correo sigue teniendo su formulario a un toque.
  // (Sin `resume`: si el aparato ya trae una sesión viva, "Continuar como…"
  // es el camino más corto y no conviene taparlo con la grilla.)
  //
  // Excepción: en el aparato del local, una sesión de rol ALTO (dueño, super
  // admin) nunca tapa la grilla — el servidor ya se encarga de no devolverla
  // (getResumeSession con pinTrusted, ver resume.ts), esto es cinturón y
  // tirantes. STAFF/WAITER sí sigue tapando la grilla con su propio atajo:
  // ya aparece ahí mismo, así que no hay nada nuevo que esconder.
  // Checklist 2026-08-25 §1.
  const openInPin = pinTrusted && !!restaurantId && !(resume && resume.lowPrivilege);
  const [mode, setMode] = useState<'password' | 'pin'>(openInPin ? 'pin' : 'password');
  const [state, formAction, isPending] = useActionState(login, emptyState);
  // Controlado a propósito: React 19 vacía los campos no controlados tras
  // cada envío, y quien se equivoca de contraseña tenía que volver a
  // escribir su correo. La contraseña sí se borra.
  const [credencial, setCredencial] = useState('');

  // Navegación de DOCUMENTO, no `redirect()` del servidor: mismo motivo que
  // `enterRestaurant` (lib/actions/mi-cuenta.ts) — el destino puede compartir
  // host con esta página (`/mi-cuenta`, `/admin`), y ese `redirect()` se
  // resuelve por dentro sin pasar por `proxy.ts`.
  const entrando = !!state && 'url' in state;
  useEffect(() => {
    if (state && 'url' in state) window.location.assign(state.url);
  }, [state]);

  // Asegura que este navegador tenga su id de aparato y su cookie espejo. Es
  // lo que permite al servidor reconocerlo en la SIGUIENTE visita (y lo que
  // hace posible que un PIN correcto lo registre solo). Sin esto, la pantalla
  // de login sería el único sitio del sistema donde el aparato no tiene
  // identidad — justo donde hace falta.
  useEffect(() => { getDeviceId(); }, []);


  const hasTenant = !!restaurantName;
  // Con PIN permitido, quien llega a la dirección del local elige arriba cómo
  // entra. Antes «Soy personal del restaurante» quedaba al final, debajo del
  // formulario del dueño, a 670 px en un teléfono.
  const conSelector = !!restaurantId && pinAllowed;
  const errorDeAcceso = state && 'error' in state ? state.error : null;

  // Un error de acceso se anuncia (role="alert") y deja el cursor en el
  // primer campo, listo para corregir sin buscarlo.
  useEffect(() => {
    if (!errorDeAcceso) return;
    const campo = document.getElementById('email') as HTMLInputElement | null;
    campo?.focus();
    campo?.select();
  }, [errorDeAcceso, state]);

  function moverSelector(e: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    const siguiente = mode === 'pin' ? 'password' : 'pin';
    // Se guarda ya: cuando corre el rAF, el evento de React ya no tiene
    // `currentTarget` y el foco se quedaba en la opción de antes.
    const grupo = e.currentTarget;
    setMode(siguiente);
    requestAnimationFrame(() => {
      grupo.querySelector<HTMLButtonElement>(`[data-modo="${siguiente}"]`)?.focus();
    });
  }

  const google = googleEnabled ? <GoogleStaffButton next={next ?? undefined} /> : null;

  return (
    <main className={s.pagina}>
      {/* La marca de Leogin, en una fila. En la PC se va a la esquina y el
          formulario queda centrado; en el teléfono va arriba y el primer
          campo empieza dentro del primer tercio de la pantalla. */}
      {!hasTenant && (
        <div className={s.marca}>
          <LeoginMark size={32} />
          <LeoginNombre letra={22} />
        </div>
      )}

      <div className={`anim-fade-up ${s.columna}`}>
        {hasTenant ? (
          <div className={s.local}>
            {logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={slug ? `/api/icon/${slug}` : logoUrl}
                alt=""
                width={40}
                height={40}
                style={{ borderRadius: 11, objectFit: 'cover', display: 'block', flexShrink: 0 }}
              />
            ) : (
              <LeoginMark size={40} />
            )}
            <div style={{ minWidth: 0 }}>
              <h1 className={s.titulo}>{restaurantName}</h1>
              <p className={s.bajada}>Entra a trabajar</p>
            </div>
          </div>
        ) : (
          <h1 className={s.titulo} style={{ fontSize: 22, marginBottom: 12 }}>Entra a tu restaurante</h1>
        )}

        {resume && (
          <Glass variant="solid" style={{ padding: '18px 20px', marginBottom: 14 }}>
            <a
              href={next ?? resume.url}
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
            {/* Antes la única salida era seguir de largo hacia el formulario
                de abajo, que no cierra la sesión vieja: alguien que agarra
                el aparato después seguía viendo este mismo "Continuar como".
                Checklist 2026-08-25 §3 — cerrar tiene que ser tan fácil como
                continuar. */}
            <form action={logout} style={{ marginTop: 6, textAlign: 'center' }}>
              <button
                type="submit"
                className="press"
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '4px 8px',
                  color: 'var(--u-text-4)',
                  fontSize: 12,
                  textDecoration: 'underline',
                  cursor: 'pointer',
                }}
              >
                No soy yo · cerrar esta sesión
              </button>
            </form>
          </Glass>
        )}

        {conSelector && (
          <div className={s.selector} role="radiogroup" aria-label="Cómo entras" onKeyDown={moverSelector}>
            <button
              type="button" role="radio" data-modo="password"
              aria-checked={mode === 'password'} tabIndex={mode === 'password' ? 0 : -1}
              onClick={() => setMode('password')}
            >
              <Icon name="mail" size={16} /> Correo o usuario
            </button>
            <button
              type="button" role="radio" data-modo="pin"
              aria-checked={mode === 'pin'} tabIndex={mode === 'pin' ? 0 : -1}
              onClick={() => setMode('pin')}
            >
              <Icon name="key" size={16} /> Con PIN
            </button>
          </div>
        )}

        {mode === 'pin' && restaurantId ? (
          <StaffPinLogin
            restaurantId={restaurantId}
            hubUrl={hubUrl ?? null}
            hubToken={hubToken ?? null}
            onBack={conSelector ? undefined : () => setMode('password')}
          />
        ) : (
        <Glass variant="solid" style={{ padding: 20 }}>
          {authError && (
            <p className={s.error} role="alert" style={{ marginBottom: 14 }}>
              <Icon name="alertCircle" size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              No pudimos completar el acceso con Google. Inténtalo otra vez o entra con tu correo.
            </p>
          )}

          {/* En leogin.com Google va ARRIBA: ahí entra el dueño, y para quien
              creó su cuenta así es un toque contra escribir correo y
              contraseña. En la dirección del local va al final: ahí casi
              todos entran con su usuario o con PIN. */}
          {google && !hasTenant && (
            <div style={{ marginBottom: 16 }}>
              {google}
              <div className={s.divisor}>o con tu correo</div>
            </div>
          )}

          <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {next && <input type="hidden" name="next" value={next} />}

            {errorDeAcceso && (
              <p className={s.error} role="alert">
                <Icon name="alertCircle" size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                {errorDeAcceso}
              </p>
            )}

            <div>
              <label htmlFor="email" className={s.etiqueta}>
                {/* En este campo caben DOS credenciales: el correo del dueño
                    y el usuario que el dueño le dio a su administrador.
                    Nombrar solo el correo dejaba a la mitad del equipo
                    mirando un campo que creía que no era suyo. Desde la
                    página principal la credencial se escribe entera
                    (`carlos@rincon-502`), que es como se entrega. */}
                Correo o usuario
              </label>
              <input
                id="email"
                name="email"
                /* `type="text"`, no `email`: `carlos@rincon-502` es una
                   credencial válida y no un buzón. `inputMode="email"`
                   conserva el teclado con @ en el teléfono, que es lo único
                   que se quería de `type="email"`. */
                type="text"
                inputMode="email"
                required
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoFocus
                aria-describedby="ayuda-usuario"
                value={credencial}
                onChange={(e) => setCredencial(e.target.value)}
                placeholder="tu@correo.com"
                className="adm-field adm-field-lg"
              />
              <p id="ayuda-usuario" className={s.ayuda}>
                {slug
                  ? <>¿Te dieron un usuario? Escríbelo tal cual, por ejemplo <strong>carlos</strong>.</>
                  : <>¿Tienes usuario? Escríbelo así: <strong>carlos@turestaurante</strong>.</>}
              </p>
            </div>

            <div>
              <label htmlFor="password" className={s.etiqueta}>Contraseña</label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="adm-field adm-field-lg"
              />
            </div>

            <button
              type="submit"
              disabled={isPending || entrando}
              className="press btn-accent"
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: 'var(--radius-full)',
                fontWeight: 600,
                fontSize: 16,
                border: 'none',
                cursor: isPending || entrando ? 'not-allowed' : 'pointer',
                opacity: isPending || entrando ? 0.7 : 1,
                marginTop: 4,
              }}
            >
              {isPending || entrando ? 'Entrando…' : 'Entrar'}
            </button>

            {/* Hasta ahora esta salida no existía: quien olvidaba su
                contraseña tenía que escribir por WhatsApp y esperar a que
                alguien de Leogin se la cambiara a mano. */}
            <a href="/admin/recuperar" className={s.olvide}>Olvidé mi contraseña</a>
          </form>

          {google && hasTenant && (
            <div style={{ marginTop: 16 }}>
              <div className={s.divisor}>o</div>
              {google}
            </div>
          )}
        </Glass>
        )}

        {/* Aparato no autorizado, con el candado puesto. Decir POR QUÉ y cuál
            es la salida: un "no puedes entrar" a secas se lee como una avería
            del sistema y termina en una llamada al dueño a media hora pico. */}
        {restaurantId && mode === 'password' && !pinAllowed && (
          <div className={s.sinPin}>
            <Icon name="key" size={17} style={{ flexShrink: 0, marginTop: 1, color: 'var(--u-text-3)' }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--u-text-2)' }}>
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
