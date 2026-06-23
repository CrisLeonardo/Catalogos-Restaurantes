'use client';

import { useActionState, useMemo, useState } from 'react';
import Link from 'next/link';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import { signupRestaurant, type SignupState } from '@/lib/actions/signup';

const empty: SignupState = null;

function localSlugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid var(--u-hair-2)',
  borderRadius: 'var(--radius-md)',
  padding: '12px 14px',
  color: 'var(--u-text)',
  fontSize: 16,
  outline: 'none',
};

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 12, color: 'var(--u-text-3)', fontWeight: 600, letterSpacing: '0.03em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
        {label}
      </label>
      {children}
      {hint && <p style={{ fontSize: 11.5, color: 'var(--u-text-4)', margin: '6px 0 0' }}>{hint}</p>}
    </div>
  );
}

export default function SignupWizard({ rootDomain }: { rootDomain: string }) {
  const [state, formAction, isPending] = useActionState(signupRestaurant, empty);

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [terms, setTerms] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);

  // El slug sigue al nombre mientras el usuario no lo edite a mano.
  const effectiveSlug = slugEdited ? slug : localSlugify(name);

  const previewHost = useMemo(() => {
    const root = rootDomain.replace(/:\d+$/, '');
    return `${effectiveSlug || 'turestaurante'}.${root}`;
  }, [effectiveSlug, rootDomain]);

  function next() {
    setStepError(null);
    if (step === 0) {
      if (name.trim().length < 2) return setStepError('Escribe el nombre de tu restaurante.');
      if (effectiveSlug.length < 3) return setStepError('La dirección debe tener al menos 3 caracteres.');
    }
    if (step === 1) {
      if (fullName.trim().length < 2) return setStepError('Escribe tu nombre.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setStepError('Escribe un correo válido.');
      if (password.length < 8) return setStepError('La contraseña debe tener al menos 8 caracteres.');
    }
    setStep((s) => Math.min(2, s + 1));
  }

  const STEPS = ['Tu restaurante', 'Tu cuenta', 'Confirmar'];

  return (
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Campos ocultos para que el server action reciba todo de una vez. */}
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="slug" value={effectiveSlug} />
      <input type="hidden" name="full_name" value={fullName} />
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="password" value={password} />
      <input type="hidden" name="whatsapp" value={whatsapp} />
      <input type="hidden" name="terms" value={terms ? 'on' : ''} />

      {/* Progreso */}
      <div style={{ display: 'flex', gap: 8 }}>
        {STEPS.map((label, i) => (
          <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ height: 4, borderRadius: 99, background: i <= step ? 'var(--brand-accent)' : 'rgba(255,255,255,0.12)', transition: 'background 200ms' }} />
            <span style={{ fontSize: 10.5, fontWeight: 600, color: i === step ? 'var(--u-text-2)' : 'var(--u-text-4)' }}>{label}</span>
          </div>
        ))}
      </div>

      {/* ── Paso 1: Restaurante ── */}
      <div style={{ display: step === 0 ? 'flex' : 'none', flexDirection: 'column', gap: 16 }}>
        <Field label="Nombre del restaurante">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej. Azúcar Negra"
            style={inputStyle}
          />
        </Field>
        <Field label="Dirección de tu menú" hint="Así llegarán tus clientes. Puedes cambiarla.">
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--u-hair-2)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <input
              value={effectiveSlug}
              onChange={(e) => { setSlugEdited(true); setSlug(localSlugify(e.target.value)); }}
              placeholder="turestaurante"
              style={{ ...inputStyle, border: 'none', background: 'transparent', flex: 1, minWidth: 0 }}
            />
            <span style={{ fontSize: 13, color: 'var(--u-text-4)', padding: '0 12px', whiteSpace: 'nowrap', flexShrink: 0 }}>
              .{rootDomain.replace(/:\d+$/, '')}
            </span>
          </div>
        </Field>
        <Glass variant="quiet" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: 'var(--u-text-3)' }}>
          <Icon name="eye" size={16} style={{ color: 'var(--brand-accent)', flexShrink: 0 }} />
          <span>Tu menú vivirá en <strong style={{ color: 'var(--u-text)' }}>{previewHost}</strong></span>
        </Glass>
      </div>

      {/* ── Paso 2: Cuenta ── */}
      <div style={{ display: step === 1 ? 'flex' : 'none', flexDirection: 'column', gap: 16 }}>
        <Field label="Tu nombre">
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Tu nombre y apellido" style={inputStyle} />
        </Field>
        <Field label="Correo" hint="Con este correo entrarás a tu panel.">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" autoComplete="email" style={inputStyle} />
        </Field>
        <Field label="Contraseña" hint="Mínimo 8 caracteres.">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" style={inputStyle} />
        </Field>
        <Field label="WhatsApp (opcional)" hint="Para recibir avisos de pedidos.">
          <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+502 0000 0000" style={inputStyle} />
        </Field>
      </div>

      {/* ── Paso 3: Confirmar ── */}
      <div style={{ display: step === 2 ? 'flex' : 'none', flexDirection: 'column', gap: 16 }}>
        <Glass variant="quiet" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Summary label="Restaurante" value={name || '—'} />
          <Summary label="Dirección" value={previewHost} />
          <Summary label="Tu cuenta" value={email || '—'} />
        </Glass>
        <Glass style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6, border: '1px solid color-mix(in srgb, var(--brand-accent) 35%, transparent)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14, color: 'var(--u-text)' }}>
            <Icon name="sparkle" size={16} style={{ color: 'var(--brand-accent)' }} /> 14 días de prueba gratis
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--u-text-3)', margin: 0, lineHeight: 1.5 }}>
            Tu restaurante queda en vivo de inmediato. Sin tarjeta. Sin compromiso. Cancela cuando quieras.
          </p>
        </Glass>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 12.5, color: 'var(--u-text-3)', cursor: 'pointer' }}>
          <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} style={{ marginTop: 2, width: 16, height: 16, accentColor: 'var(--brand-accent)' }} />
          <span>Acepto los términos del servicio y la política de privacidad de Leogin.</span>
        </label>
      </div>

      {/* Errores */}
      {(stepError || state?.error) && (
        <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'rgba(220,50,50,0.12)', border: '1px solid rgba(220,50,50,0.25)', color: '#f87171', fontSize: 13.5 }}>
          {stepError ?? state?.error}
        </div>
      )}

      {/* Navegación */}
      <div style={{ display: 'flex', gap: 10 }}>
        {step > 0 && (
          <button
            type="button"
            onClick={() => { setStepError(null); setStep((s) => Math.max(0, s - 1)); }}
            className="press"
            style={{ padding: '13px 18px', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 15, border: '1px solid var(--u-hair-2)', background: 'rgba(255,255,255,0.06)', color: 'var(--u-text)', cursor: 'pointer' }}
          >
            Atrás
          </button>
        )}
        {step < 2 ? (
          <button
            type="button"
            onClick={next}
            className="press btn-accent"
            style={{ flex: 1, padding: '13px', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 15, border: 'none', color: '#fff', cursor: 'pointer' }}
          >
            Continuar
          </button>
        ) : (
          <button
            type="submit"
            disabled={isPending || !terms}
            className="press btn-accent"
            style={{ flex: 1, padding: '13px', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 15, border: 'none', color: '#fff', cursor: (isPending || !terms) ? 'not-allowed' : 'pointer', opacity: (isPending || !terms) ? 0.6 : 1 }}
          >
            {isPending ? 'Creando tu restaurante…' : 'Crear mi restaurante'}
          </button>
        )}
      </div>

      <p style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--u-text-4)', margin: 0 }}>
        ¿Ya tienes cuenta? <Link href="/login" style={{ color: 'var(--brand-accent)', fontWeight: 600, textDecoration: 'none' }}>Inicia sesión</Link>
      </p>
    </form>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
      <span style={{ color: 'var(--u-text-4)' }}>{label}</span>
      <span style={{ color: 'var(--u-text)', fontWeight: 600, textAlign: 'right', wordBreak: 'break-word' }}>{value}</span>
    </div>
  );
}
