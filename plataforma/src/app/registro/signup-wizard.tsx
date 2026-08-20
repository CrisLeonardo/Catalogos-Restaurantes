'use client';

import { useActionState, useEffect, useState } from 'react';
import Link from 'next/link';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import GoogleStaffButton from '@/components/auth/google-staff-button';
import GoogleG from '@/components/auth/google-g';
import { signupAccount, type SignupState } from '@/lib/actions/signup';
import { defaultPlanPricing, type PlanPricing } from '@/lib/plans';
import { ErrorBox, Field, Stepper, WizardNav, inputStyle } from '@/components/signup/wizard-ui';

const empty: SignupState = null;

/* ============================================================
   CREAR UNA CUENTA DE LEOGIN
   ------------------------------------------------------------
   Esta pantalla crea una CUENTA y nada más. El restaurante se crea después,
   en `/mi-cuenta/nuevo`, con su plan, su nombre y su estilo.

   Antes este mismo asistente creaba las dos cosas de un tirón, en cinco
   pasos. Eso tenía dos costos: la pantalla donde más gente abandona era
   también la más larga, y —más grave— ataba la cuenta a un restaurante,
   así que abrir el segundo local exigía inventarse otro correo. Partirlo
   en dos arregla las dos cosas a la vez, y deja UN solo sitio donde nace
   un restaurante, con las mismas reglas para el primero y para el quinto.
   ============================================================ */

/**
 * Borrador mientras el navegador se va a Google y vuelve.
 *
 * Entrar con Google es una redirección de página completa: sin esto, quien
 * ya escribió su nombre volvería a un formulario en blanco. Se guarda en
 * sessionStorage (muere con la pestaña) y NUNCA lleva contraseñas: con
 * Google no hay ninguna que guardar.
 */
const DRAFT_KEY = 'leogin_signup_draft';

type Draft = { step: number; fullName: string };

export default function SignupWizard({
  pricing = defaultPlanPricing(),
  googleEnabled = false,
  googleAccount = null,
  existingAccount = null,
  authError = false,
}: {
  pricing?: PlanPricing;
  /** ¿Está configurado el acceso con Google? (NEXT_PUBLIC_GOOGLE_AUTH_ENABLED) */
  googleEnabled?: boolean;
  /** Cuenta de Google ya autenticada y todavía SIN perfil → alta sin contraseña. */
  googleAccount?: { email: string; fullName: string | null } | null;
  /** Cuenta de Leogin ya abierta en este navegador. */
  existingAccount?: { email: string; restaurantName: string | null; panelUrl: string | null } | null;
  /** Volvimos de Google sin sesión (cancelado o fallido) — se avisa y se sigue. */
  authError?: boolean;
}) {
  const trialDays = pricing.trialDays;
  const [state, formAction, isPending] = useActionState(signupAccount, empty);

  const [step, setStep] = useState(0);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  // El correo se escribe UNA vez. La doble captura se quitó a propósito: era
  // un campo más que llenar en la pantalla donde más gente abandona, y el
  // dedazo —que sigue siendo el riesgo real, porque con ese correo se entra
  // al panel y se recupera la contraseña— se ataja igual de bien mostrándolo
  // grande en el paso "Confirmar", antes de crear nada. La contraseña sí se
  // repite: esa no se puede releer.
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  // Ver lo que se escribió: la confirmación dice "coinciden", esto dice "qué".
  const [showPassword, setShowPassword] = useState(false);
  const [terms, setTerms] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);

  const googleEmail = googleAccount?.email ?? null;
  const googleName = googleAccount?.fullName ?? null;
  /** Con Google no hay contraseña que pedir: la identidad ya está probada. */
  const withGoogle = !!googleEmail;

  // Volvimos de Google: recuperar el borrador y seguir donde se quedó.
  // Corre siempre, no solo cuando el login salió bien: el borrador únicamente
  // se escribe al salir hacia Google, así que si existe es que esta pestaña
  // estaba a mitad del alta — y quien canceló en la pantalla de Google merece
  // encontrar su formulario intacto, no en blanco.
  useEffect(() => {
    let draft: Draft | null = null;
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (raw) {
        draft = JSON.parse(raw) as Draft;
        sessionStorage.removeItem(DRAFT_KEY);
      }
    } catch {
      /* sessionStorage bloqueado o borrador corrupto → formulario limpio */
    }
    if (draft) {
      setFullName(draft.fullName || googleName || '');
      setStep(draft.step);
    } else if (googleEmail) {
      setFullName((prev) => prev || googleName || '');
    }
  }, [googleEmail, googleName]);

  /** Guarda el borrador justo antes de que el navegador se vaya a Google. */
  function saveDraft() {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ step, fullName } satisfies Draft));
    } catch {
      /* sin sessionStorage se pierde el borrador, pero el alta sigue */
    }
  }

  const STEPS = ['Tu cuenta', 'Confirmar'];
  const LAST_STEP = STEPS.length - 1;

  function next() {
    setStepError(null);
    if (step === 0) {
      if (fullName.trim().length < 2) return setStepError('Escribe tu nombre.');
      // Con Google el correo viene de la sesión (verificado por Google) y no
      // hay contraseña: solo se valida lo que la persona sí escribió.
      if (!withGoogle) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setStepError('Escribe un correo válido.');
        if (password.length < 8) return setStepError('La contraseña debe tener al menos 8 caracteres.');
        if (password !== password2) return setStepError('Las dos contraseñas no coinciden.');
      }
    }
    setStep((s) => Math.min(LAST_STEP, s + 1));
  }

  return (
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <input type="hidden" name="full_name" value={fullName} />
      <input type="hidden" name="email" value={withGoogle ? '' : email} />
      <input type="hidden" name="password" value={withGoogle ? '' : password} />
      <input type="hidden" name="password2" value={withGoogle ? '' : password2} />
      <input type="hidden" name="terms" value={terms ? 'on' : ''} />
      {/* Pista, no credencial: el servidor relee la sesión de Google. */}
      <input type="hidden" name="auth_provider" value={withGoogle ? 'google' : 'password'} />

      <Stepper steps={STEPS} step={step} />

      {/* ── Paso 0: Tu cuenta ── */}
      <div style={{ display: step === 0 ? 'flex' : 'none', flexDirection: 'column', gap: 16 }}>
        {/* Ya hay una sesión abierta con cuenta de Leogin. Decirlo aquí evita
            el "ya existe ese correo" al final, cuando ya se llenó todo. */}
        {existingAccount && !withGoogle && (
          <Glass variant="quiet" style={{ padding: '13px 15px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, fontWeight: 700, color: 'var(--u-text)' }}>
              <Icon name="user" size={15} style={{ color: 'var(--brand-accent-ink)' }} />
              Ya tienes sesión iniciada como {existingAccount.email}
            </div>
            <p style={{ fontSize: 12, color: 'var(--u-text-3)', margin: 0, lineHeight: 1.5 }}>
              {existingAccount.restaurantName
                ? `Esa cuenta administra ${existingAccount.restaurantName}. `
                : ''}
              No hace falta otra: con la que ya tienes puedes abrir todos los
              restaurantes que quieras.
              {' '}
              <a href="/mi-cuenta/nuevo" style={{ color: 'var(--brand-accent-ink)', fontWeight: 600, textDecoration: 'none' }}>
                Crear un restaurante
              </a>
              {existingAccount.panelUrl && (
                <>
                  {' · '}
                  <a href={existingAccount.panelUrl} style={{ color: 'var(--brand-accent-ink)', fontWeight: 600, textDecoration: 'none' }}>
                    Ir a mi panel
                  </a>
                </>
              )}
            </p>
          </Glass>
        )}

        {withGoogle ? (
          /* Alta con Google: el correo lo pone Google (ya verificado) y no
             hay contraseña que inventar ni que recordar. */
          <Glass variant="quiet" style={{ padding: '13px 15px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <GoogleG size={22} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12, color: 'var(--u-text-4)' }}>Entrarás con tu cuenta de Google</div>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--u-text)', wordBreak: 'break-all' }}>
                {googleEmail}
              </div>
            </div>
            <span className="chip chip-ok" style={{ flexShrink: 0 }}>
              <Icon name="check" size={12} /> Lista
            </span>
          </Glass>
        ) : googleEnabled ? (
          <>
            <GoogleStaffButton
              intent="signup"
              label="Registrarme con Google"
              next="/registro"
              onBeforeRedirect={saveDraft}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ flex: 1, height: 1, background: 'var(--u-hair-2)' }} />
              <span style={{ fontSize: 11.5, color: 'var(--u-text-4)', whiteSpace: 'nowrap' }}>o crea tu cuenta con un correo</span>
              <span style={{ flex: 1, height: 1, background: 'var(--u-hair-2)' }} />
            </div>
          </>
        ) : null}

        <Field label="Tu nombre">
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Tu nombre y apellido" style={inputStyle} />
        </Field>
        {!withGoogle && (
        <Field label="Correo" hint="Con este correo entrarás a tu panel y recuperarás tu contraseña si se te olvida. Revísalo bien.">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" autoComplete="email" style={inputStyle} />
        </Field>
        )}
        {!withGoogle && (
        <>
        <Field label="Contraseña" hint="Mínimo 8 caracteres.">
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              style={inputStyle}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Ocultar la contraseña' : 'Ver la contraseña'}
              className="press"
              style={{
                flexShrink: 0, padding: '0 14px', borderRadius: 'var(--radius-md)',
                border: '1px solid var(--u-hair-2)', background: 'rgba(255,255,255,0.05)',
                color: 'var(--u-text-3)', cursor: 'pointer',
              }}
            >
              <Icon name="eye" size={17} />
            </button>
          </div>
        </Field>
        <Field
          label="Repite tu contraseña"
          hint={
            password2.length > 0 && password !== password2
              ? 'Las dos contraseñas no coinciden.'
              : undefined
          }
        >
          <input
            type={showPassword ? 'text' : 'password'}
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            autoComplete="new-password"
            style={inputStyle}
          />
        </Field>
        </>
        )}
      </div>

      {/* ── Paso 1: Confirmar ── */}
      <div style={{ display: step === 1 ? 'flex' : 'none', flexDirection: 'column', gap: 16 }}>
        {/* El correo, aparte y en grande. Sustituye a la doble captura: es el
            identificador de login y la única vía de recuperación, así que la
            última oportunidad de cazar un dedazo tiene que verse, no esconderse
            en una fila más de una lista. */}
        <Glass variant="quiet" style={{ padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          {withGoogle ? <GoogleG size={19} /> : <Icon name="mail" size={17} style={{ color: 'var(--brand-accent-ink)', flexShrink: 0 }} />}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--u-text)', wordBreak: 'break-all' }}>
              {(withGoogle ? googleEmail : email) || '—'}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: 2 }}>
              {withGoogle
                ? 'Entrarás a tu panel con esta cuenta de Google. Sin contraseña que recordar.'
                : 'Con este correo entrarás a tu panel. Revísalo: si está mal, no podrás recuperar tu cuenta.'}
            </div>
          </div>
          {!withGoogle && (
            <button
              type="button"
              onClick={() => { setStepError(null); setStep(0); }}
              className="press"
              style={{
                marginLeft: 'auto', flexShrink: 0, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                padding: '6px 12px', borderRadius: 99, border: '1px solid var(--u-hair-2)',
                background: 'rgba(255,255,255,0.05)', color: 'var(--u-text-2)',
              }}
            >
              Corregir
            </button>
          )}
        </Glass>

        <Glass style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6, border: '1px solid color-mix(in srgb, var(--brand-accent) 35%, transparent)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14, color: 'var(--u-text)' }}>
            <Icon name="sparkle" size={16} style={{ color: 'var(--brand-accent-ink)' }} />
            Lo que sigue: crear tu restaurante
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--u-text-3)', margin: 0, lineHeight: 1.5 }}>
            En cuanto tengas tu cuenta te llevamos a crearlo: eliges plan, nombre y
            estilo, y queda en vivo. Empiezas con {trialDays} días gratis, sin tarjeta.
            Con esta misma cuenta podrás abrir los que quieras.
          </p>
        </Glass>

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 12.5, color: 'var(--u-text-3)', cursor: 'pointer' }}>
          <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} style={{ marginTop: 2, width: 16, height: 16, accentColor: 'var(--brand-accent)' }} />
          <span>
            Acepto los{' '}
            <Link href="/terminos" target="_blank" onClick={(e) => e.stopPropagation()} style={{ color: 'var(--brand-accent-ink)', fontWeight: 600, textDecoration: 'none' }}>términos del servicio</Link>
            {' '}y la{' '}
            <Link href="/privacidad" target="_blank" onClick={(e) => e.stopPropagation()} style={{ color: 'var(--brand-accent-ink)', fontWeight: 600, textDecoration: 'none' }}>política de privacidad</Link>
            {' '}de Leogin.
          </span>
        </label>
      </div>

      {/* Errores */}
      {authError && !stepError && !state?.error && !withGoogle && (
        <ErrorBox>
          No se completó el acceso con Google. Puedes intentarlo otra vez o seguir con tu correo — lo que ya llenaste sigue aquí.
        </ErrorBox>
      )}
      {(stepError || state?.error) && <ErrorBox>{stepError ?? state?.error}</ErrorBox>}

      <WizardNav
        step={step}
        lastStep={LAST_STEP}
        onBack={() => { setStepError(null); setStep((s) => Math.max(0, s - 1)); }}
        onNext={next}
        submitLabel="Crear mi cuenta"
        pendingLabel="Creando tu cuenta…"
        isPending={isPending}
        canSubmit={terms}
      />

      <p style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--u-text-4)', margin: 0 }}>
        ¿Ya tienes cuenta?{' '}
        <Link href="/login" style={{ color: 'var(--brand-accent-ink)', fontWeight: 600, textDecoration: 'none' }}>
          Inicia sesión
        </Link>
      </p>
    </form>
  );
}
