'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import TemplateGallery from '@/components/admin/template-gallery';
import { findStructure, findTemplate } from '@/lib/theme/templates';
import { borrarEleccionMuestra, leerEleccionMuestra } from '@/lib/muestra-mensajes';
import { borrarPerfil, leerPerfil } from '@/lib/perfil-negocio';
import { createAnotherRestaurant, type NewRestaurantState } from '@/lib/actions/mi-cuenta';
import { RestauranteListo } from '@/components/signup/restaurante-listo';
import { PLAN_POINTS, defaultPlanPricing, planPriceLabel, planPriceQ, type PlanPricing } from '@/lib/plans';
import {
  ErrorBox, Field, Stepper, Summary, WizardNav, localSlugify,
} from '@/components/signup/wizard-ui';

/* ============================================================
   CREAR UN RESTAURANTE — desde Mi cuenta
   ------------------------------------------------------------
   Esta pantalla era los tres primeros pasos del asistente de `/registro`.
   Se movió aquí cuando el alta se partió en dos: la calle crea una CUENTA,
   y los restaurantes nacen siempre desde Mi cuenta, sea el primero o el
   quinto. Un solo sitio donde nace un restaurante, con las mismas reglas
   para todos — antes eran dos caminos que se fueron separando solos (el de
   `/registro` sabía de plantillas y modos de pedido; el de Mi cuenta no).

   Lo que NO se pide aquí y sí se pedía antes: correo, contraseña y
   términos. Eso es de la cuenta, ya está hecho, y volver a pedirlo era
   justamente lo que impedía tener dos restaurantes con un solo correo.
   ============================================================ */

type PlanOption = 'BASICO' | 'ESTANDAR' | 'PREMIUM';
type OrderTypeOption = 'dine_in' | 'pickup' | 'delivery';

const ORDER_TYPE_LABEL: Record<OrderTypeOption, string> = {
  dine_in: 'Comer en local',
  pickup: 'Para llevar',
  delivery: 'A domicilio',
};

const ESTANDAR_TYPE_OPTIONS: { id: OrderTypeOption; icon: string; title: string; desc: string }[] = [
  { id: 'dine_in', icon: 'utensils', title: 'Comer en local', desc: 'El cliente pide desde la mesa con QR. Ideal para restaurantes y cafeterías.' },
  { id: 'pickup', icon: 'bag', title: 'Para llevar', desc: 'El cliente pide en línea y retira en el mostrador.' },
  { id: 'delivery', icon: 'truck', title: 'A domicilio', desc: 'Tus clientes piden en línea y reciben en su dirección.' },
];

interface PlanCardDef {
  code: PlanOption;
  name: string;
  badge?: string;
  priceLabel: string;
  priceUnit: string;
  trialLabel: string;
  features: { text: string; positive: boolean }[];
}

/* Los precios y los días de prueba salen del PlanPricing vigente
   (overrides del super admin) — el servidor los pasa por props.

   `esElPrimero` cambia lo que se promete: la prueba gratis es UNA por
   persona (ver lib/billing-signup.ts), así que decirle "30 días gratis" a
   quien va por su segundo local sería mentirle. */
function buildPlanCards(pricing: PlanPricing, esElPrimero: boolean): PlanCardDef[] {
  const trial = pricing.trialDays;
  const conPrueba = esElPrimero && trial > 0;
  return [
    {
      code: 'BASICO',
      name: 'Básico',
      badge: 'GRATIS',
      priceLabel: planPriceLabel(pricing, 'BASICO'),
      priceUnit: '',
      trialLabel: 'Gratis para siempre, sin tarjeta',
      features: PLAN_POINTS.BASICO,
    },
    {
      code: 'ESTANDAR',
      name: 'Estándar',
      priceLabel: planPriceQ(pricing, 'ESTANDAR'),
      priceUnit: '/ mes',
      trialLabel: conPrueba ? `Con ${trial} días gratis` : 'Se suma a tu mensualidad',
      features: PLAN_POINTS.ESTANDAR,
    },
    {
      code: 'PREMIUM',
      name: 'Premium',
      badge: 'RECOMENDADO',
      priceLabel: conPrueba ? `Gratis ${trial} días` : planPriceQ(pricing, 'PREMIUM'),
      priceUnit: conPrueba ? '' : '/ mes',
      trialLabel: conPrueba ? `luego ${planPriceLabel(pricing, 'PREMIUM')}` : 'Se suma a tu mensualidad',
      features: PLAN_POINTS.PREMIUM,
    },
  ];
}

export default function NuevoRestaurante({
  rootDomain,
  pricing = defaultPlanPricing(),
  esElPrimero,
}: {
  rootDomain: string;
  pricing?: PlanPricing;
  /** ¿Todavía no es dueño de ningún restaurante? Decide prueba gratis y textos. */
  esElPrimero: boolean;
}) {
  const PLAN_CARDS = buildPlanCards(pricing, esElPrimero);
  const trialDays = pricing.trialDays;
  const [state, formAction, isPending] = useActionState<NewRestaurantState, FormData>(createAnotherRestaurant, null);
  // El local nuevo se abre con una navegación de documento, no con el
  // `redirect()` del servidor: su panel es la raíz de otro host y esa raíz
  // solo es el panel si la petición pasa por el proxy. Mismo motivo —y mismo
  // bug— que al entrar desde Mi cuenta; ver `enterRestaurant`.
  //
  // Antes de entrar, «Así se ve TU restaurante» (PLAN_MOMENTOS_PICO G1): la
  // navegación la hace su botón «Entrar a mi panel».
  const [listo, setListo] = useState<string | null>(null);
  useEffect(() => {
    if (state && 'url' in state) {
      borrarEleccionMuestra();
      borrarPerfil();
      setListo(state.url);
    }
  }, [state]);
  const actionError = state && 'error' in state ? state.error : null;

  const [step, setStep] = useState(0);
  const [selectedPlan, setSelectedPlan] = useState<PlanOption>('PREMIUM');
  // Estándar elige 2 de los 3 modos de pedido (el 3ero requiere Premium).
  const [estandarTypes, setEstandarTypes] = useState<OrderTypeOption[]>(['dine_in', 'pickup']);
  // Estilo visual de inicio (plantilla); siempre se puede cambiar en Personalizar.
  // Claro por defecto (2026-08-24): «Lino & Coral», no «Carbón de Autor», que
  // es oscura de verdad desde 2026-10-27.
  const [templateId, setTemplateId] = useState('lino-coral');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [whatsapp, setWhatsapp] = useState('');
  const [stepError, setStepError] = useState<string | null>(null);

  // Lo que eligió en la vitrina de diseños de la portada llega puesto: el
  // estilo y, si lo escribió, el nombre. Ya decidió; preguntarle desde cero
  // lo haría dudar (docs/planes/PLAN_EXPERIENCIA_VIVA_2026-10-26.md §1.6).
  // En un efecto y no al iniciar el estado: localStorage no existe en el
  // servidor y el primer pintado tiene que coincidir.
  const [desdeVitrina, setDesdeVitrina] = useState(false);
  useEffect(() => {
    const eleccion = leerEleccionMuestra();
    if (!eleccion) return;
    if (findTemplate(eleccion.estilo)) {
      setTemplateId(eleccion.estilo);
      setDesdeVitrina(true);
    }
    if (eleccion.nombre.trim().length >= 2) setName((actual) => actual || eleccion.nombre.trim());
  }, []);

  // Quien llegó por /vende-en-linea no tiene mesas: el plan llega armado
  // como lo va a usar —Estándar con para llevar y a domicilio— en vez de
  // Premium con un salón y un mesero que no tiene (lib/perfil-negocio.ts).
  // Solo cambia lo que viene marcado; puede elegir otro igual.
  const [enLinea, setEnLinea] = useState(false);
  useEffect(() => {
    if (leerPerfil() !== 'en-linea') return;
    setEnLinea(true);
    setSelectedPlan('ESTANDAR');
    setEstandarTypes(['pickup', 'delivery']);
  }, []);

  const effectiveSlug = slugEdited ? slug : localSlugify(name);

  // El estilo elegido son dos decisiones (estructura + paleta): el resumen las
  // nombra las dos, o el dueño no ve por ningún lado la que más cambia su menú.
  const chosenTemplate = findTemplate(templateId);
  const chosenStructure = chosenTemplate?.structure ? findStructure(chosenTemplate.structure) : undefined;
  const styleSummary = chosenTemplate
    ? [chosenStructure?.name, chosenTemplate.name].filter(Boolean).join(' · ')
    : 'Clásico';

  function toggleEstandarType(id: OrderTypeOption) {
    setEstandarTypes((prev) => {
      const isOn = prev.includes(id);
      if (isOn) return prev.length === 1 ? prev : prev.filter((t) => t !== id);
      return prev.length >= 2 ? prev : [...prev, id];
    });
  }

  const estandarSummary = estandarTypes.map((t) => ORDER_TYPE_LABEL[t]).join(' + ');

  const previewHost = useMemo(() => {
    const root = rootDomain.replace(/:\d+$/, '');
    return `${effectiveSlug || 'turestaurante'}.${root}`;
  }, [effectiveSlug, rootDomain]);

  const STEPS = ['Tu plan', 'Tu restaurante', 'Tu estilo', 'Confirmar'];
  const LAST_STEP = STEPS.length - 1;

  function next() {
    setStepError(null);
    if (step === 1) {
      if (name.trim().length < 2) return setStepError('Escribe el nombre de tu restaurante.');
      if (effectiveSlug.length < 3) return setStepError('La dirección debe tener al menos 3 caracteres.');
      if (whatsapp && !/^\+?[\d\s\-()]{7,20}$/.test(whatsapp)) {
        return setStepError('El número de WhatsApp no es válido.');
      }
    }
    setStep((s) => Math.min(LAST_STEP, s + 1));
  }

  const conPrueba = esElPrimero && trialDays > 0;

  return (
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <input type="hidden" name="plan_code" value={selectedPlan} />
      <input type="hidden" name="estandar_order_types" value={estandarTypes.join(',')} />
      <input type="hidden" name="template_id" value={templateId} />
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="slug" value={effectiveSlug} />
      <input type="hidden" name="whatsapp" value={whatsapp} />

      <Stepper steps={STEPS} step={step} />

      {/* ── Paso 0: Tu plan ── */}
      <div style={{ display: step === 0 ? 'flex' : 'none', flexDirection: 'column', gap: 12 }}>
        <p style={{ fontSize: 13, color: 'var(--u-text-3)', margin: 0, lineHeight: 1.5 }}>
          {conPrueba
            ? `Elige el plan con el que quieres empezar. Todos incluyen ${trialDays} días gratis.`
            : 'Elige el plan de este restaurante. Se cobra aparte y se suma a tu mensualidad desde hoy: la prueba gratis es solo para el primero.'}
        </p>
        {enLinea && (
          <p style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, lineHeight: 1.5, margin: 0, padding: '10px 12px', borderRadius: 'var(--radius-lg)', background: 'color-mix(in srgb, var(--brand-accent) 8%, transparent)', color: 'var(--u-text-2)' }}>
            <Icon name="truck" size={16} style={{ color: 'var(--brand-accent)', flexShrink: 0, marginTop: 2 }} />
            Lo dejamos listo para vender en línea: Estándar con para llevar y a domicilio, sin mesas ni meseros. Puedes cambiarlo si quieres.
          </p>
        )}
        <div className="signup-plans">
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
                    : 'color-mix(in srgb, var(--u-text) 4%, transparent)',
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
                    fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 'var(--radius-full)',
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
                  <div style={{ fontSize: 11, color: 'var(--u-text-4)', marginTop: 2 }}>
                    {plan.trialLabel}
                  </div>
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {plan.features.map((f) => (
                    <li key={f.text} style={{
                      fontSize: 11, color: f.positive ? 'var(--u-text-3)' : 'var(--u-text-4)',
                      display: 'flex', gap: 5, alignItems: 'flex-start',
                    }}>
                      <span style={{
                        color: f.positive ? (active ? 'var(--brand-accent)' : 'var(--u-text-4)') : 'var(--u-text-4)',
                        flexShrink: 0, lineHeight: 1.6, fontSize: 11,
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

        {/* Sub-selector: Estándar elige 2 de 3 modos de pedido */}
        {selectedPlan === 'ESTANDAR' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ fontSize: 12, color: 'var(--u-text-3)', margin: 0, fontWeight: 600 }}>
              Elige 2 modos de pedido (mismo precio, {planPriceLabel(pricing, 'ESTANDAR')})
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {ESTANDAR_TYPE_OPTIONS.map((b) => {
                const active = estandarTypes.includes(b.id);
                const capped = !active && estandarTypes.length >= 2;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => toggleEstandarType(b.id)}
                    disabled={capped}
                    style={{
                      padding: '12px 12px',
                      borderRadius: 'var(--radius-lg)',
                      border: active ? '2px solid var(--brand-accent)' : '2px solid var(--u-hair-2)',
                      background: active ? 'rgba(var(--brand-accent-rgb,99,102,241),0.08)' : 'color-mix(in srgb, var(--u-text) 4%, transparent)',
                      cursor: capped ? 'not-allowed' : 'pointer',
                      opacity: capped ? 0.45 : 1,
                      textAlign: 'left',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      transition: 'border-color 150ms, background 150ms, opacity 150ms',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <Icon name={b.icon} size={16} style={{ color: active ? 'var(--brand-accent)' : 'var(--u-text-3)' }} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--u-text)' }}>{b.title}</span>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--u-text-3)', lineHeight: 1.45 }}>{b.desc}</span>
                  </button>
                );
              })}
            </div>
            <p style={{ fontSize: 11, color: 'var(--u-text-4)', margin: 0, lineHeight: 1.45 }}>
              Para tener los 3 modos juntos necesitas Premium. Podrás cambiar tu elección cuando quieras desde el panel.
            </p>
          </div>
        )}
      </div>

      {/* ── Paso 1: Tu restaurante ── */}
      <div style={{ display: step === 1 ? 'flex' : 'none', flexDirection: 'column', gap: 16 }}>
        <Field label="Nombre del restaurante">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej. Tu Restaurante"
            className="adm-field adm-field-lg"
          />
        </Field>
        <Field label="Dirección de tu menú" hint="Así llegarán tus clientes. Puedes cambiarla.">
          {/* El recuadro es el campo (se marca al enfocar el texto de dentro). */}
          <div className="adm-field adm-field-lg" style={{ display: 'flex', alignItems: 'center', padding: 0, overflow: 'hidden' }}>
            <input
              value={effectiveSlug}
              onChange={(e) => { setSlugEdited(true); setSlug(localSlugify(e.target.value)); }}
              placeholder="turestaurante"
              aria-label="Dirección de tu menú"
              style={{
                flex: 1, minWidth: 0, padding: '12px 14px', border: 'none', background: 'transparent',
                color: 'inherit', font: 'inherit', outline: 'none',
              }}
            />
            <span style={{ fontSize: 13, color: 'var(--u-text-4)', padding: '0 12px', whiteSpace: 'nowrap', flexShrink: 0 }}>
              .{rootDomain.replace(/:\d+$/, '')}
            </span>
          </div>
        </Field>
        <Field label="WhatsApp del restaurante" hint="Opcional. Para las alertas de pedido; se cambia luego en Ajustes.">
          <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+502 0000 0000" className="adm-field adm-field-lg" />
        </Field>
        <Glass variant="quiet" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--u-text-3)' }}>
          <Icon name="eye" size={16} style={{ color: 'var(--brand-accent-ink)', flexShrink: 0 }} />
          <span>Tu menú vivirá en <strong style={{ color: 'var(--u-text)' }}>{previewHost}</strong></span>
        </Glass>
      </div>

      {/* ── Paso 2: Tu estilo (plantilla visual de inicio) ── */}
      <div style={{ display: step === 2 ? 'flex' : 'none', flexDirection: 'column', gap: 12 }}>
        <p style={{ fontSize: 13, color: 'var(--u-text-3)', margin: 0, lineHeight: 1.5 }}>
          Elige primero cómo se recorre tu carta y después con qué colores nace: son
          dos decisiones distintas y cualquier color va en cualquier estructura.
          Es solo el punto de partida — todo se cambia luego en «Personalizar».
        </p>
        {desdeVitrina && (
          <Glass variant="quiet" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--u-text-3)' }}>
            <Icon name="sparkle" size={16} style={{ color: 'var(--brand-accent-ink)', flexShrink: 0 }} />
            <span>Te dejamos puesto el que elegiste en la portada: <strong style={{ color: 'var(--u-text)' }}>{styleSummary}</strong>.</span>
          </Glass>
        )}
        {/* La galería abre en la estructura de la plantilla que ya está elegida,
            no siempre en «Clásico»: abriendo siempre en la primera parecía que
            solo existían las de siempre y que el resto no estaba. */}
        <TemplateGallery
          mode="pick"
          compact
          initialStructure={chosenTemplate?.structure ?? 'clasico'}
          appliedId={templateId}
          onApply={(tpl) => setTemplateId(tpl.id)}
          brandName={name}
        />
      </div>

      {/* ── Paso 3: Confirmar ── */}
      <div style={{ display: step === 3 ? 'flex' : 'none', flexDirection: 'column', gap: 16 }}>
        <Glass variant="quiet" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Summary
            label="Plan"
            value={
              selectedPlan === 'BASICO'
                ? `Básico · ${planPriceLabel(pricing, 'BASICO')} para siempre`
                : selectedPlan === 'ESTANDAR'
                  ? `Estándar · ${estandarSummary} · ${planPriceLabel(pricing, 'ESTANDAR')}${conPrueba ? ` (${trialDays} días gratis)` : ''}`
                  : conPrueba
                    ? `Premium · ${trialDays} días gratis, luego ${planPriceLabel(pricing, 'PREMIUM')}`
                    : `Premium · ${planPriceLabel(pricing, 'PREMIUM')}`
            }
          />
          <Summary label="Restaurante" value={name || '—'} />
          <Summary label="Dirección" value={previewHost} />
          <Summary label="Estilo" value={styleSummary} />
          {whatsapp && <Summary label="WhatsApp" value={whatsapp} />}
        </Glass>

        <Glass style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6, border: '1px solid color-mix(in srgb, var(--brand-accent) 35%, transparent)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14, color: 'var(--u-text)' }}>
            <Icon name="sparkle" size={16} style={{ color: 'var(--brand-accent-ink)' }} />
            {selectedPlan === 'BASICO'
              ? 'Gratis para siempre'
              : conPrueba
                ? `${trialDays} días de prueba gratis`
                : 'Se cobra desde hoy'}
          </div>
          <p style={{ fontSize: 12, color: 'var(--u-text-3)', margin: 0, lineHeight: 1.5 }}>
            {selectedPlan === 'BASICO'
              ? 'Tu restaurante queda en vivo con tu menú digital. Sin tarjeta. Sin compromiso. Cancela cuando quieras.'
              : conPrueba
                ? (selectedPlan === 'ESTANDAR'
                  ? `Tu restaurante queda en vivo con pedidos de ${estandarSummary.toLowerCase()} activos. Sin tarjeta. Sin compromiso.`
                  : 'Tu restaurante queda en vivo con pedidos online activos. Sin tarjeta. Sin compromiso. Cancela cuando quieras.')
                : 'La prueba gratis es una por persona y ya la usaste en tu primer restaurante, así que este entra a tu mensualidad desde hoy. Puedes darlo de baja cuando quieras.'}
          </p>
        </Glass>
      </div>

      {(stepError || actionError) && <ErrorBox>{stepError ?? actionError}</ErrorBox>}

      <WizardNav
        step={step}
        lastStep={LAST_STEP}
        onBack={() => { setStepError(null); setStep((s) => Math.max(0, s - 1)); }}
        onNext={next}
        submitLabel={esElPrimero ? 'Crear mi restaurante' : 'Crear restaurante'}
        pendingLabel="Creando tu restaurante…"
        isPending={isPending}
      />

      <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--u-text-4)', margin: 0 }}>
        <Link href="/mi-cuenta" style={{ color: 'var(--brand-accent-ink)', fontWeight: 600, textDecoration: 'none' }}>
          Volver a Mi cuenta
        </Link>
      </p>

      {listo && <RestauranteListo url={listo} estilo={templateId} nombre={name} />}
    </form>
  );
}
