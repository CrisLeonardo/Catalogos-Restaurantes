'use client';

import { useActionState, useEffect, useState } from 'react';
import Link from 'next/link';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import GoogleStaffButton from '@/components/auth/google-staff-button';
import GoogleG from '@/components/auth/google-g';
import { signupAccount, type SignupState } from '@/lib/actions/signup';
import type { PlanPricing } from '@/lib/plans';
import { ErrorBox, Field, Stepper, WizardNav, enfocarCampo } from '@/components/signup/wizard-ui';
import { enlaceDeAlta, type IntencionAlta } from '@/lib/alta';

const PLAN_NOMBRE_ALTA: Record<IntencionAlta['plan'], string> = {
  BASICO: 'Básico', EN_LINEA: 'En línea', ESTANDAR: 'Estándar', PREMIUM: 'Premium',
};

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

type Draft = { fullName: string };

export default function SignupWizard({
  googleEnabled = false,
  googleAccount = null,
  existingAccount = null,
  authError = false,
  intencion = null,
  precioIntencion = null,
}: {
  /** Lo que eligió en la web (LZ-11). Se muestra en una línea y viaja al alta. */
  intencion?: IntencionAlta | null;
  /** «Q150 / mes» o «Gratis», con los precios vigentes. */
  precioIntencion?: string | null;
  /** Ya no se usa en esta pantalla (ficha 2.3); se conserva la firma. */
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
  const [state, formAction, isPending] = useActionState(signupAccount, empty);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  // El correo se escribe UNA vez. La doble captura se quitó a propósito: era
  // un campo más que llenar en la pantalla donde más gente abandona, y el
  // dedazo —que sigue siendo el riesgo real, porque con ese correo se entra
  // al panel y se recupera la contraseña— se ataja igual de bien mostrándolo
  // grande en el paso "Confirmar", antes de crear nada. La contraseña sí se
  // repite: esa no se puede releer.
  const [password, setPassword] = useState('');
  // Ver lo que se escribió: la confirmación dice "coinciden", esto dice "qué".
  const [showPassword, setShowPassword] = useState(false);
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
    } else if (googleEmail) {
      setFullName((prev) => prev || googleName || '');
    }
  }, [googleEmail, googleName]);

  /** Guarda el borrador justo antes de que el navegador se vaya a Google. */
  function saveDraft() {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ fullName } satisfies Draft));
    } catch {
      /* sin sessionStorage se pierde el borrador, pero el alta sigue */
    }
  }

  /* Ficha 2.3: una sola pantalla. «Confirmar» se fue: el correo se ve
     grande bajo su campo, la contraseña se escribe una vez con «Ver» y los
     términos se aceptan al crear la cuenta, dicho junto al botón. */
  function validar(e: React.FormEvent<HTMLFormElement>) {
    setStepError(null);
    const [error, campo] = fullName.trim().length < 2
      ? ['Escribe tu nombre.', 'input[autocomplete="name"]']
      : !withGoogle && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        ? ['Escribe un correo válido.', 'input[type="email"]']
        : !withGoogle && password.length < 8
          ? ['La contraseña debe tener al menos 8 caracteres.', 'input[autocomplete="new-password"]']
          : [null, null];
    if (error) {
      e.preventDefault();
      setStepError(error);
      // El aviso se anuncia solo (role="alert"); el foco va a lo que falta.
      enfocarCampo(e.currentTarget, campo!);
    }
  }

  return (
    <form action={formAction} onSubmit={validar} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <input type="hidden" name="full_name" value={fullName} />
      <input type="hidden" name="email" value={withGoogle ? '' : email} />
      <input type="hidden" name="password" value={withGoogle ? '' : password} />
      {/* El servidor sigue pidiendo la repetición: se manda la misma, porque
          con «Ver» la persona ya comprobó lo que escribió. */}
      <input type="hidden" name="password2" value={withGoogle ? '' : password} />
      <input type="hidden" name="terms" value="on" />
      {/* Pista, no credencial: el servidor relee la sesión de Google. */}
      <input type="hidden" name="auth_provider" value={withGoogle ? 'google' : 'password'} />

      <Stepper steps={['Tu cuenta', 'Tu negocio', 'Qué vendes', 'Tu carta']} step={0} />

      {/* Maqueta aprobada: docs/diseno/MAQUETA_ALTA_CON_PLAN_2026-11-23.html §1.
          Una línea, sin botón: confirma lo que eligió y que aquí no se cobra. */}
      {intencion && (
        <p className="alta-plan-elegido">
          <span aria-hidden className="alta-plan-punto" />
          <span>
            Plan elegido: <strong>{PLAN_NOMBRE_ALTA[intencion.plan]} · {precioIntencion}</strong>.
            {' '}Lo confirmas antes de crear tu restaurante.
          </span>
        </p>
      )}
      {intencion && (
        <>
          <input type="hidden" name="alta_plan" value={intencion.plan} />
          <input type="hidden" name="alta_caso" value={intencion.caso} />
        </>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
              <a href={enlaceDeAlta(intencion, '/mi-cuenta/nuevo')} style={{ color: 'var(--brand-accent-ink)', fontWeight: 600, textDecoration: 'none' }}>
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
              next={enlaceDeAlta(intencion)}
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
          {(ids) => (
            <input {...ids} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Tu nombre y apellido" autoComplete="name" className="adm-field adm-field-lg" />
          )}
        </Field>
        {!withGoogle && (
        <Field label="Correo" hint="Con este correo entrarás a tu panel y recuperarás tu contraseña si se te olvida. Revísalo bien.">
          {(ids) => (
            <input {...ids} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" autoComplete="email" className="adm-field adm-field-lg" />
          )}
        </Field>
        )}
        {!withGoogle && (
        <>
        <Field label="Contraseña" hint="Mínimo 8 caracteres.">
          {(ids) => (
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              {...ids}
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className="adm-field adm-field-lg"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Ocultar la contraseña' : 'Ver la contraseña'}
              className="press"
              style={{
                flexShrink: 0, padding: '0 14px', borderRadius: 'var(--radius-md)',
                border: '1px solid var(--u-hair-2)', background: 'color-mix(in srgb, var(--u-text) 5%, transparent)',
                color: 'var(--u-text-3)', cursor: 'pointer',
              }}
            >
              <Icon name="eye" size={17} />
            </button>
          </div>
          )}
        </Field>
        </>
        )}
      </div>

      <p style={{ fontSize: 12.5, color: 'var(--u-text-3)', margin: 0, lineHeight: 1.5 }}>
        Al crear tu cuenta aceptas los{' '}
        <Link href="/terminos" target="_blank" style={{ color: 'var(--brand-accent-ink)', fontWeight: 600, textDecoration: 'none' }}>términos del servicio</Link>
        {' '}y la{' '}
        <Link href="/privacidad" target="_blank" style={{ color: 'var(--brand-accent-ink)', fontWeight: 600, textDecoration: 'none' }}>política de privacidad</Link>
        {' '}de Leogin.
      </p>

      {/* Errores */}
      {authError && !stepError && !state?.error && !withGoogle && (
        <ErrorBox>
          No se completó el acceso con Google. Puedes intentarlo otra vez o seguir con tu correo — lo que ya llenaste sigue aquí.
        </ErrorBox>
      )}
      {(stepError || state?.error) && <ErrorBox>{stepError ?? state?.error}</ErrorBox>}

      <WizardNav
        step={0}
        lastStep={0}
        onBack={() => {}}
        onNext={() => {}}
        submitLabel="Crear mi cuenta"
        pendingLabel="Creando tu cuenta…"
        isPending={isPending}
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
