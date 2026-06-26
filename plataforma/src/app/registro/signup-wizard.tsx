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

type PlanOption = 'BASICO' | 'ESTANDAR' | 'PREMIUM';

interface PlanCardDef {
  code: PlanOption;
  name: string;
  badge?: string;
  priceLabel: string;
  priceUnit: string;
  trialLabel: string;
  features: { text: string; positive: boolean }[];
  highlight: boolean;
}

const PLAN_CARDS: PlanCardDef[] = [
  {
    code: 'BASICO',
    name: 'Básico',
    priceLabel: 'Q199',
    priceUnit: '/ mes',
    trialLabel: 'Con 30 días gratis',
    features: [
      { text: 'Menú digital con QR imprimible', positive: true },
      { text: 'Productos ilimitados · 1 usuario', positive: true },
      { text: 'Tu logo y color de marca', positive: true },
      { text: 'Sin pedidos en línea', positive: false },
    ],
    highlight: false,
  },
  {
    code: 'ESTANDAR',
    name: 'Estándar',
    priceLabel: 'Q399',
    priceUnit: '/ mes',
    trialLabel: 'Con 30 días gratis',
    features: [
      { text: 'Menú QR + pedidos para llevar', positive: true },
      { text: 'Alertas en tiempo real · WhatsApp', positive: true },
      { text: 'Productos ilimitados · 2 usuarios', positive: true },
      { text: 'Hasta Q10,000 en ventas / mes', positive: true },
    ],
    highlight: false,
  },
  {
    code: 'PREMIUM',
    name: 'Premium',
    badge: 'RECOMENDADO',
    priceLabel: 'Gratis 30 días',
    priceUnit: '',
    trialLabel: 'luego Q599 / mes',
    features: [
      { text: 'Para llevar, comer en local y delivery', positive: true },
      { text: 'Panel de mesero, recetas y cupones', positive: true },
      { text: 'Usuarios ilimitados · sin restricciones', positive: true },
      { text: 'Hasta Q20,000 en ventas / mes', positive: true },
    ],
    highlight: true,
  },
];

export default function SignupWizard({ rootDomain }: { rootDomain: string }) {
  const [state, formAction, isPending] = useActionState(signupRestaurant, empty);

  const [step, setStep] = useState(0);
  const [selectedPlan, setSelectedPlan] = useState<PlanOption>('PREMIUM');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [terms, setTerms] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);

  const effectiveSlug = slugEdited ? slug : localSlugify(name);

  const previewHost = useMemo(() => {
    const root = rootDomain.replace(/:\d+$/, '');
    return `${effectiveSlug || 'turestaurante'}.${root}`;
  }, [effectiveSlug, rootDomain]);

  function next() {
    setStepError(null);
    if (step === 1) {
      if (name.trim().length < 2) return setStepError('Escribe el nombre de tu restaurante.');
      if (effectiveSlug.length < 3) return setStepError('La dirección debe tener al menos 3 caracteres.');
    }
    if (step === 2) {
      if (fullName.trim().length < 2) return setStepError('Escribe tu nombre.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setStepError('Escribe un correo válido.');
      if (password.length < 8) return setStepError('La contraseña debe tener al menos 8 caracteres.');
    }
    setStep((s) => Math.min(3, s + 1));
  }

  const STEPS = ['Tu plan', 'Tu restaurante', 'Tu cuenta', 'Confirmar'];

  return (
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <input type="hidden" name="plan_code" value={selectedPlan} />
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
            <div style={{
              height: 4, borderRadius: 99,
              background: i <= step ? 'var(--brand-accent)' : 'rgba(255,255,255,0.12)',
              transition: 'background 200ms',
            }} />
            <span style={{ fontSize: 10.5, fontWeight: 600, color: i === step ? 'var(--u-text-2)' : 'var(--u-text-4)' }}>
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* ── Paso 0: Tu plan ── */}
      <div style={{ display: step === 0 ? 'flex' : 'none', flexDirection: 'column', gap: 12 }}>
        <p style={{ fontSize: 13.5, color: 'var(--u-text-3)', margin: 0, lineHeight: 1.5 }}>
          Elige el plan con el que quieres empezar. Ambos incluyen 30 días gratis.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {PLAN_CARDS.map((plan) => {
            const active = selectedPlan === plan.code;
            return (
              <button
                key={plan.code}
                type="button"
                onClick={() => setSelectedPlan(plan.code)}
                style={{
                  padding: '14px 12px',
                  borderRadius: 'var(--radius-lg)',
                  border: active
                    ? '2px solid var(--brand-accent)'
                    : '2px solid var(--u-hair-2)',
                  background: active
                    ? 'rgba(var(--brand-accent-rgb,99,102,241),0.08)'
                    : 'rgba(255,255,255,0.03)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'border-color 150ms, background 150ms',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  position: 'relative',
                }}
              >
                {plan.badge && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
                    background: 'var(--brand-accent)', color: '#fff', letterSpacing: '0.07em',
                    alignSelf: 'flex-start',
                  }}>
                    {plan.badge}
                  </span>
                )}
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--u-text)', marginBottom: 4 }}>
                    {plan.name}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: active ? 'var(--brand-accent)' : 'var(--u-text-2)', lineHeight: 1.1 }}>
                    {plan.priceLabel}
                    {plan.priceUnit && <span style={{ fontSize: 12, fontWeight: 500 }}> {plan.priceUnit}</span>}
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--u-text-4)', marginTop: 2 }}>
                    {plan.trialLabel}
                  </div>
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {plan.features.map((f) => (
                    <li key={f.text} style={{
                      fontSize: 11.5, color: f.positive ? 'var(--u-text-3)' : 'var(--u-text-4)',
                      display: 'flex', gap: 5, alignItems: 'flex-start',
                    }}>
                      <span style={{
                        color: f.positive ? (active ? 'var(--brand-accent)' : 'var(--u-text-4)') : 'var(--u-text-4)',
                        flexShrink: 0, lineHeight: 1.6, fontSize: 10,
                      }}>
                        {f.positive ? '✓' : '✗'}
                      </span>
                      {f.text}
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Paso 1: Tu restaurante ── */}
      <div style={{ display: step === 1 ? 'flex' : 'none', flexDirection: 'column', gap: 16 }}>
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
          <div style={{
            display: 'flex', alignItems: 'center', gap: 0,
            background: 'rgba(255,255,255,0.05)', border: '1px solid var(--u-hair-2)',
            borderRadius: 'var(--radius-md)', overflow: 'hidden',
          }}>
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

      {/* ── Paso 2: Tu cuenta ── */}
      <div style={{ display: step === 2 ? 'flex' : 'none', flexDirection: 'column', gap: 16 }}>
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
      <div style={{ display: step === 3 ? 'flex' : 'none', flexDirection: 'column', gap: 16 }}>
        <Glass variant="quiet" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Summary label="Plan" value={selectedPlan === 'PREMIUM' ? 'Premium · 30 días gratis, luego Q599/mes' : selectedPlan === 'ESTANDAR' ? 'Estándar · Q399/mes (30 días gratis)' : 'Básico · Q199/mes (30 días gratis)'} />
          <Summary label="Restaurante" value={name || '—'} />
          <Summary label="Dirección" value={previewHost} />
          <Summary label="Tu cuenta" value={email || '—'} />
        </Glass>
        <Glass style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6, border: '1px solid color-mix(in srgb, var(--brand-accent) 35%, transparent)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14, color: 'var(--u-text)' }}>
            <Icon name="sparkle" size={16} style={{ color: 'var(--brand-accent)' }} />
            30 días de prueba gratis
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--u-text-3)', margin: 0, lineHeight: 1.5 }}>
            {selectedPlan === 'BASICO'
              ? 'Tu restaurante queda en vivo con tu menú digital. Sin tarjeta. Sin compromiso. Cancela cuando quieras.'
              : selectedPlan === 'ESTANDAR'
              ? 'Tu restaurante queda en vivo con pedidos para llevar activos. Sin tarjeta. Sin compromiso.'
              : 'Tu restaurante queda en vivo con pedidos online activos. Sin tarjeta. Sin compromiso. Cancela cuando quieras.'}
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
        {step < 3 ? (
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
        ¿Ya tienes cuenta?{' '}
        <Link href="/login" style={{ color: 'var(--brand-accent)', fontWeight: 600, textDecoration: 'none' }}>
          Inicia sesión
        </Link>
      </p>
    </form>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
      <span style={{ color: 'var(--u-text-4)', flexShrink: 0 }}>{label}</span>
      <span style={{ color: 'var(--u-text)', fontWeight: 600, textAlign: 'right', wordBreak: 'break-word' }}>{value}</span>
    </div>
  );
}
