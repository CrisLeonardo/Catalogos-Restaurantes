'use client';

import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/icons';
import { findStructure, findTemplate } from '@/lib/theme/templates';
import { borrarEleccionMuestra, leerEleccionMuestra } from '@/lib/muestra-mensajes';
import { borrarPerfil, leerPerfil } from '@/lib/perfil-negocio';
import { createAnotherRestaurant, type NewRestaurantState } from '@/lib/actions/mi-cuenta';
import { CartaEnVivo } from '@/components/signup/carta-en-vivo';
import { PLANS, defaultPlanPricing, planPriceLabel, type PlanPricing } from '@/lib/plans';
import {
  leerPlatosDelAlta, modosEstandar, planSugerido,
  type ComoTePiden, type IntencionAlta, type ModoPedido, type PlanAlta,
} from '@/lib/alta';
import { diaDeCobroDelAlta } from '@/lib/billing-signup';
import { fmtMoney } from '@/lib/money';
import { ErrorBox, Field, Stepper, WizardNav, enfocarCampo, localSlugify } from '@/components/signup/wizard-ui';
import { leerLista } from '@/lib/importar-carta';

/* ============================================================
   CREAR UN RESTAURANTE — alta hasta el primer valor (ficha 2.3)
   ------------------------------------------------------------
   Maqueta aprobada: docs/diseno/MAQUETA_ALTA_PRIMER_VALOR_2026-11-16.html

   Tres pasos, después de la cuenta: el negocio (nombre y «¿cómo te
   piden?»), lo que vende (nombre y precio) y su carta de verdad, con el
   estilo y el plan ya elegidos y a la vista con su precio. Al crear,
   entra directo a Hoy, donde sigue la guía «Llega a tu primer pedido».

   Antes eran plan → restaurante → estilo → confirmar → «listo»: el plan
   venía en Premium para todos y el estilo se escogía entre 208
   combinaciones con la carta vacía.

   Es el ÚNICO sitio donde nace un restaurante, sea el primero o el
   quinto de la misma cuenta.
   ============================================================ */

const COMO: { id: ComoTePiden; titulo: string; detalle: string }[] = [
  { id: 'carta', titulo: 'Solo ven la carta', detalle: 'La consultan con un QR y piden en persona' },
  { id: 'llevar', titulo: 'Para llevar y a domicilio', detalle: 'Piden desde la carta en su teléfono' },
  // La cuarta respuesta de la web (LZ-11): sin ella, quien eligió Estándar
  // en Planes acababa con Premium o con En línea propuesto.
  { id: 'mostrador', titulo: 'En mostrador', detalle: 'Piden en el mostrador y pagan en caja' },
  { id: 'mesas', titulo: 'En mesas, con meseros', detalle: 'Toman pedidos en el salón y cobran en caja' },
];

/* Tres estilos para «Cambiar»: uno claro, uno que va con el negocio y uno
   oscuro. Las 208 combinaciones siguen en Personalizar. */
const ESTILOS: Record<ComoTePiden, string[]> = {
  carta: ['lino-coral', 'cafe-barrio', 'carbon-autor'],
  llevar: ['lino-coral', 'naranja-reparto', 'carbon-autor'],
  mostrador: ['lino-coral', 'cafe-barrio', 'carbon-autor'],
  mesas: ['lino-coral', 'brasa-humo', 'carbon-autor'],
};

const PLAN_NOMBRE: Record<PlanAlta, string> = {
  BASICO: 'Básico', EN_LINEA: 'En línea', ESTANDAR: 'Estándar', PREMIUM: 'Premium',
};

const MODO_NOMBRE: Record<ModoPedido, string> = {
  dine_in: 'comer en local', pickup: 'para llevar', delivery: 'a domicilio',
};

/* Lo que separa a cada plan del de al lado, no lo que tienen en común.
   Con «Para llevar y a domicilio» elegido, En línea y Estándar decían los
   dos «para llevar y a domicilio» y parecían el mismo plan a distinto
   precio (dueño, 2026-11-20). Los números salen de PLANS. */
function detallePlan(plan: PlanAlta, como: ComoTePiden): string {
  if (plan === 'BASICO') return `Solo la carta con QR, sin pedidos en línea · hasta ${PLANS.BASICO.maxProducts} platillos`;
  if (plan === 'EN_LINEA') {
    return `Para empezar: para llevar y a domicilio, ${PLANS.EN_LINEA.users} usuario, hasta ${PLANS.EN_LINEA.maxProducts} platillos y unos ${PLANS.EN_LINEA.monthlyOrderCap} pedidos al mes`;
  }
  if (plan === 'ESTANDAR') {

    const modos = modosEstandar(como).map((m) => (m === 'dine_in' ? 'comer en local por mostrador' : MODO_NOMBRE[m])).join(' y ');
    return `Empiezas con ${modos} y puedes activar los tres modos en Funciones. Sin tope de pedidos ni platillos, ${PLANS.ESTANDAR.users} usuarios, corte de caja y reportes`;
  }
  return 'Todo: los tres modos, mesas y meseros, inventario, lealtad y usuarios sin límite';
}

type Fila = { nombre: string; precio: string };
const FILAS_VACIAS: Fila[] = [{ nombre: '', precio: '' }, { nombre: '', precio: '' }, { nombre: '', precio: '' }];

function nombreEstilo(id: string): string {
  const t = findTemplate(id);
  if (!t) return 'Clásico';
  const e = t.structure ? findStructure(t.structure) : undefined;
  return [e?.name, t.name].filter(Boolean).join(' · ');
}

export default function NuevoRestaurante({
  rootDomain,
  pricing = defaultPlanPricing(),
  esElPrimero,
  intencion = null,
}: {
  /** Lo que eligió en la web (LZ-11): la respuesta y el plan llegan puestos,
   *  y se pueden cambiar. Maqueta: docs/diseno/MAQUETA_ALTA_CON_PLAN_2026-11-23.html §2. */
  intencion?: IntencionAlta | null;
  rootDomain: string;
  pricing?: PlanPricing;
  /** ¿Todavía no es dueño de ningún restaurante? Decide textos y pasos. */
  esElPrimero: boolean;
}) {
  const [state, formAction, isPending] = useActionState<NewRestaurantState, FormData>(createAnotherRestaurant, null);
  /* El panel del local nuevo es la raíz de otro host: navega el navegador,
     no un `redirect()` del servidor (ver `enterRestaurant`). */
  useEffect(() => {
    if (state && 'url' in state) {
      borrarEleccionMuestra();
      borrarPerfil();
      window.location.assign(state.url);
    }
  }, [state]);
  const actionError = state && 'error' in state ? state.error : null;

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [editandoSlug, setEditandoSlug] = useState(false);
  const [como, setComo] = useState<ComoTePiden | null>(intencion?.caso ?? null);
  // El plan de la web vale mientras no cambie la respuesta: al elegir otra,
  // vuelve la sugerencia de esa respuesta (como al cambiarla a mano).
  const [planElegido, setPlanElegido] = useState<PlanAlta | null>(intencion?.plan ?? null);
  const [templateId, setTemplateId] = useState('lino-coral');
  /* El estilo con el que llegó (el de la vitrina de la portada, si eligió
     uno): encabeza las opciones de «Cambiar» y no se mueve al elegir otra. */
  const [estiloInicial, setEstiloInicial] = useState('lino-coral');
  const [filas, setFilas] = useState<Fila[]>(FILAS_VACIAS);
  const [cambiando, setCambiando] = useState<'estilo' | 'plan' | null>(null);
  /* «Pegar mi lista» (ficha 2.4): la carta que ya tiene escrita llena las
     filas, con el mismo lector que la importación del panel. */
  const [pegando, setPegando] = useState(false);
  const [lista, setLista] = useState('');
  const [avisoLista, setAvisoLista] = useState<string | null>(null);

  function usarLista() {
    const todas = leerLista(lista);
    const leidas = todas.filter((f) => f.precio !== null && f.precio > 0 && !f.duda);
    if (leidas.length === 0) { setAvisoLista('No encontramos platillos con precio. Revisa que cada línea tenga nombre y precio.'); return; }
    setFilas(leidas.slice(0, 20).map((f) => ({ nombre: f.nombre, precio: String(f.precio) })));
    /* Lo que no se usó se dice, con nombre: nunca se descarta en silencio. */
    const fuera = todas.filter((f) => !leidas.includes(f)).map((f) => f.nombre);
    const avisos = [
      fuera.length ? `No usamos ${fuera.length === 1 ? 'una línea' : `${fuera.length} líneas`} sin precio claro (${fuera.slice(0, 3).join(', ')}${fuera.length > 3 ? '…' : ''}); agrégalas a mano.` : null,
      leidas.length > 20 ? 'Tomamos los primeros 20. El resto lo importas desde tu panel, en Menú › Importar carta.' : null,
    ].filter(Boolean);
    setAvisoLista(avisos.length ? avisos.join(' ') : null);
    setPegando(false);
    setLista('');
  }
  const [stepError, setStepError] = useState<string | null>(null);

  // Lo que eligió en la vitrina de diseños de la portada llega puesto.
  useEffect(() => {
    const eleccion = leerEleccionMuestra();
    if (!eleccion) return;
    if (findTemplate(eleccion.estilo)) { setTemplateId(eleccion.estilo); setEstiloInicial(eleccion.estilo); }
    if (eleccion.nombre.trim().length >= 2) setName((actual) => actual || eleccion.nombre.trim());
  }, []);
  // Quien llegó por /vende-en-linea vende para llevar y a domicilio.
  useEffect(() => {
    if (leerPerfil() === 'en-linea') setComo((actual) => actual ?? 'llevar');
  }, []);

  const comoEfectivo: ComoTePiden = como ?? 'carta';
  const plan: PlanAlta = planElegido ?? planSugerido(comoEfectivo);
  const effectiveSlug = slugEdited ? slug : localSlugify(name);
  const host = `${effectiveSlug || 'turestaurante'}.${rootDomain.replace(/:\d+$/, '')}`;
  /* La demo enseña lo que se paga: si la respuesta no corresponde al plan
     elegido («Solo ven la carta» con Estándar), manda el caso del plan. */
  const casoDemo: ComoTePiden = planSugerido(comoEfectivo) === plan ? comoEfectivo
    : plan === 'PREMIUM' ? 'mesas' : plan === 'EN_LINEA' ? 'llevar' : comoEfectivo === 'llevar' ? 'llevar' : 'mostrador';
  const demoHref = `${/localhost|^127\./.test(rootDomain) ? 'http' : 'https'}://demo.${rootDomain}/?caso=${casoDemo}&plan=${plan}`;

  /* Lo que ya se puede pintar en la carta: filas completas y válidas. */
  const platos = useMemo(() => filas
    .map((f) => ({ nombre: f.nombre.trim(), precio: Math.round(Number(f.precio.replace(',', '.')) * 100) / 100 }))
    .filter((p) => p.nombre.length >= 2 && Number.isFinite(p.precio) && p.precio > 0), [filas]);

  const pasos = esElPrimero ? ['Tu cuenta', 'Tu negocio', 'Qué vendes', 'Tu carta'] : ['Tu negocio', 'Qué vendes', 'Tu carta'];
  const LAST_STEP = 2;

  /* El aviso se anuncia solo (ErrorBox, role="alert"); además el foco va a
     lo que falta (LZ-04). */
  const formRef = useRef<HTMLFormElement>(null);
  const falta = (mensaje: string, selector: string) => {
    setStepError(mensaje);
    enfocarCampo(formRef.current, selector);
  };

  function next() {
    setStepError(null);
    if (step === 0) {
      if (name.trim().length < 2) return falta('Escribe el nombre de tu negocio.', 'input[autocomplete="organization"]');
      if (effectiveSlug.length < 3) {
        setEditandoSlug(true);
        return falta('La dirección de tu carta debe tener al menos 3 letras.', 'input[placeholder="turestaurante"]');
      }
      if (!como) return falta('Elige cómo te piden tus clientes.', 'input[name="como_te_piden"]');
    }
    if (step === 1) {
      const r = leerPlatosDelAlta(JSON.stringify(filas));
      if ('error' in r) return setStepError(r.error);
    }
    setStep((s) => Math.min(LAST_STEP, s + 1));
  }

  function cambiarFila(i: number, campo: keyof Fila, valor: string) {
    setFilas((prev) => prev.map((f, j) => (j === i ? { ...f, [campo]: valor } : f)));
  }

  const precioPlan = planPriceLabel(pricing, plan);
  const conPrueba = pricing.trialDays > 0 && plan !== 'BASICO';
  /* El primer cobro, con monto, fecha y dónde se paga (LZ-01; maqueta
     §3). La fecha sale de la misma regla que guarda el alta: vence el día
     del alta, cada mes; del 29 al 31, el 28. Cada restaurante tiene su
     propio cobro: no «se suma» a otro. */
  const { billing_day: diaCobro, started_at: hoy } = diaDeCobroDelAlta();
  const [anio, mes, dia] = hoy.split('-').map(Number);
  const vence = new Date(Date.UTC(anio, mes - 1, diaCobro));
  const fechaVence = new Intl.DateTimeFormat('es-GT', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(vence);
  const monto = fmtMoney(pricing.prices[plan], 'GTQ', Number.isInteger(pricing.prices[plan]) ? 0 : 2);
  const notaCobro = plan === 'BASICO'
    ? 'El plan Básico es gratis para siempre, sin tarjeta.'
    : conPrueba
      ? `Empiezas con ${pricing.trialDays} días gratis, sin tarjeta. Si quieres seguir por ${precioPlan}, confirma la contratación en Mi suscripción.`
      : `Tu primer cobro es de ${monto} y vence ${diaCobro === dia ? `hoy, ${fechaVence}` : `el ${fechaVence}`}; después, cada ${diaCobro}. Lo pagas desde Mi suscripción. Sin contrato: lo cambias o das de baja cuando quieras.`;

  return (
    <form ref={formRef} action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <input type="hidden" name="plan_code" value={plan} />
      <input type="hidden" name="estandar_order_types" value={modosEstandar(comoEfectivo).join(',')} />
      <input type="hidden" name="template_id" value={templateId} />
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="slug" value={effectiveSlug} />
      <input type="hidden" name="platos" value={JSON.stringify(filas)} />

      <Stepper steps={pasos} step={esElPrimero ? step + 1 : step} />

      {/* ── 1 · Tu negocio ── */}
      <div style={{ display: step === 0 ? 'flex' : 'none', flexDirection: 'column', gap: 16 }}>
        <Field label="¿Cómo se llama tu negocio?">
          {(ids) => (
          <input
            {...ids}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej. Café Ana"
            autoComplete="organization"
            className="adm-field adm-field-lg"
          />
          )}
        </Field>
        {editandoSlug ? (
          <Field label="Dirección de tu carta" hint="Así llegarán tus clientes.">
            {(ids) => (
            <div className="adm-field adm-field-lg" style={{ display: 'flex', alignItems: 'center', padding: 0, overflow: 'hidden' }}>
              <input
                {...ids}
                value={effectiveSlug}
                onChange={(e) => { setSlugEdited(true); setSlug(localSlugify(e.target.value)); }}
                placeholder="turestaurante"
                style={{ flex: 1, minWidth: 0, padding: '12px 14px', border: 'none', background: 'transparent', color: 'inherit', font: 'inherit', outline: 'none' }}
              />
              <span style={{ fontSize: 13, color: 'var(--u-text-4)', padding: '0 12px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                .{rootDomain.replace(/:\d+$/, '')}
              </span>
            </div>
            )}
          </Field>
        ) : (
          <p style={{ margin: '-8px 0 0', fontSize: 13, color: 'var(--u-text-3)', overflowWrap: 'anywhere' }}>
            Tu carta: <strong style={{ color: 'var(--u-text)' }}>{host}</strong>{' · '}
            <button type="button" onClick={() => setEditandoSlug(true)} className="alta-enlace">Cambiar</button>
          </p>
        )}

        <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <legend style={{ fontSize: 15, fontWeight: 700, color: 'var(--u-text)', marginBottom: 10, padding: 0 }}>
            ¿Cómo te piden tus clientes?
          </legend>
          {COMO.map((c) => (
            <label key={c.id} className="alta-opcion" data-activa={como === c.id || undefined}>
              <input
                type="radio"
                name="como_te_piden"
                value={c.id}
                checked={como === c.id}
                onChange={() => { setComo(c.id); setPlanElegido(null); setStepError(null); }}
              />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: 'var(--u-text)' }}>{c.titulo}</span>
                <span style={{ display: 'block', fontSize: 13, color: 'var(--u-text-3)', marginTop: 2 }}>{c.detalle}</span>
              </span>
            </label>
          ))}
        </fieldset>
      </div>

      {/* ── 2 · Qué vendes ── */}
      <div className="alta-dos" style={{ display: step === 1 ? undefined : 'none' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <div>
            <h2 className="t-display" style={{ fontSize: 24, margin: 0, lineHeight: 1.15 }}>¿Qué vendes?</h2>
            <p style={{ fontSize: 14, color: 'var(--u-text-3)', margin: '6px 0 0', lineHeight: 1.45 }}>
              Con uno basta para ver tu carta: nombre y precio. La foto, la descripción y los demás, cuando quieras.
            </p>
          </div>
          {filas.map((f, i) => (
            <div key={i} className="alta-fila">
              <input
                value={f.nombre}
                onChange={(e) => cambiarFila(i, 'nombre', e.target.value)}
                placeholder={i === 0 ? 'Ej. Café americano' : 'Otro platillo'}
                aria-label={`Nombre del platillo ${i + 1}`}
                maxLength={120}
                className="adm-field adm-field-lg"
              />
              <div className="adm-field adm-field-lg" style={{ display: 'flex', alignItems: 'center', padding: 0, overflow: 'hidden' }}>
                <span style={{ paddingLeft: 12, color: 'var(--u-text-4)', fontSize: 14 }}>Q</span>
                <input
                  value={f.precio}
                  onChange={(e) => cambiarFila(i, 'precio', e.target.value.replace(/[^\d.,]/g, ''))}
                  inputMode="decimal"
                  placeholder="0.00"
                  aria-label={`Precio del platillo ${i + 1}`}
                  style={{ flex: 1, minWidth: 0, padding: '12px 10px 12px 6px', border: 'none', background: 'transparent', color: 'inherit', font: 'inherit', outline: 'none', fontVariantNumeric: 'tabular-nums' }}
                />
              </div>
            </div>
          ))}
          {pegando ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label htmlFor="alta-lista" style={{ fontSize: 13, color: 'var(--u-text-3)', lineHeight: 1.45 }}>
                Pega tu carta como la tienes: un platillo por línea con su precio.
              </label>
              <textarea
                id="alta-lista"
                value={lista}
                onChange={(e) => setLista(e.target.value)}
                rows={7}
                placeholder={'Café americano Q15\nPan con frijol 12.50'}
                className="adm-field"
                style={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 14, resize: 'vertical' }}
              />
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <button type="button" onClick={usarLista} className="alta-enlace alta-agregar" disabled={!lista.trim()}>Usar esta lista</button>
                <button type="button" onClick={() => setPegando(false)} className="alta-enlace alta-agregar" style={{ color: 'var(--u-text-3)' }}>Cancelar</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              {filas.length < 20 && (
                <button type="button" onClick={() => setFilas((p) => [...p, { nombre: '', precio: '' }])} className="alta-enlace alta-agregar">
                  <Icon name="plus" size={16} /> Agregar otro
                </button>
              )}
              <button type="button" onClick={() => { setPegando(true); setAvisoLista(null); }} className="alta-enlace alta-agregar">
                <Icon name="list" size={16} /> Pegar mi lista
              </button>
            </div>
          )}
          {avisoLista && <p style={{ margin: 0, fontSize: 13, color: 'var(--u-text-3)', lineHeight: 1.45 }}>{avisoLista}</p>}
        </div>
        <div className="alta-solo-pc">
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--u-text-3)', textAlign: 'center', marginBottom: 10 }}>
            Tu carta, en vivo
          </div>
          {step >= 1 && <CartaEnVivo estilo={templateId} nombre={name} platos={platos} pedidos={plan !== 'BASICO'} />}
        </div>
      </div>

      {/* ── 3 · Tu carta ── */}
      {step === 2 && <h2 className="t-display" style={{ fontSize: 24, margin: 0, lineHeight: 1.15 }}>Así se ve tu carta</h2>}
      <div className="alta-dos" style={{ display: step === 2 ? undefined : 'none' }}>
        <div className="alta-telefono">
          {step === 2 && <CartaEnVivo estilo={templateId} nombre={name} platos={platos} pedidos={plan !== 'BASICO'} />}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <div className="alta-resumen">
            <div className="alta-renglon">
              <span className="alta-k">Estilo</span>
              <span className="alta-v">{nombreEstilo(templateId)}</span>
              <button type="button" className="alta-enlace" aria-expanded={cambiando === 'estilo'}
                onClick={() => setCambiando((c) => (c === 'estilo' ? null : 'estilo'))}>Cambiar</button>
            </div>
            {cambiando === 'estilo' && (
              <div className="alta-elegir">
                {[...new Set([estiloInicial, ...ESTILOS[comoEfectivo]])].slice(0, 4).map((id) => (
                  <label key={id} className="alta-opcion" data-activa={templateId === id || undefined}>
                    <input type="radio" name="estilo_alta" checked={templateId === id} onChange={() => setTemplateId(id)} />
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--u-text)' }}>{nombreEstilo(id)}</span>
                  </label>
                ))}
                <p style={{ margin: 0, fontSize: 12, color: 'var(--u-text-3)' }}>Los demás estilos están en Personalizar, dentro de tu panel.</p>
              </div>
            )}
            <div className="alta-renglon">
              <span className="alta-k">Plan</span>
              <span className="alta-v">{PLAN_NOMBRE[plan]} · {precioPlan}</span>
              <button type="button" className="alta-enlace" aria-expanded={cambiando === 'plan'}
                onClick={() => setCambiando((c) => (c === 'plan' ? null : 'plan'))}>Cambiar</button>
            </div>
            {cambiando === 'plan' && (
              <div className="alta-elegir">
                {(['BASICO', 'EN_LINEA', 'ESTANDAR', 'PREMIUM'] as PlanAlta[]).map((p) => (
                  <label key={p} className="alta-opcion" data-activa={plan === p || undefined}>
                    <input type="radio" name="plan_alta" checked={plan === p} onChange={() => setPlanElegido(p)} />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--u-text)' }}>
                        {PLAN_NOMBRE[p]} · {planPriceLabel(pricing, p)}
                      </span>
                      <span style={{ display: 'block', fontSize: 12, color: 'var(--u-text-3)', marginTop: 2 }}>{detallePlan(p, comoEfectivo)}</span>
                    </span>
                  </label>
                ))}
                <Link href="/planes" target="_blank" className="alta-enlace" style={{ fontSize: 13 }}>Comparar los planes</Link>
              </div>
            )}
          </div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--u-text-3)', lineHeight: 1.45 }}>{notaCobro}</p>
          {/* PLAN-03: antes del primer cobro, ver funcionando lo que se paga
              (la demo del mismo caso: mostrador, mesas o para llevar). */}
          {plan !== 'BASICO' && (
            <a href={demoHref} target="_blank" rel="noopener noreferrer" className="alta-enlace" style={{ fontSize: 13, alignSelf: 'flex-start' }}>
              Ver cómo funciona {PLAN_NOMBRE[plan]} en la demo <Icon name="arrowRight" size={13} />
            </a>
          )}
          {platos.length === 0 && (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--u-text-3)', lineHeight: 1.45 }}>
              Aún no escribiste platillos: tu panel te pedirá el primero.
            </p>
          )}
        </div>
      </div>

      {(stepError || actionError) && <ErrorBox>{stepError ?? actionError}</ErrorBox>}

      {step === 1 && (
        <button
          type="button"
          onClick={() => { setStepError(null); setFilas(FILAS_VACIAS); setStep(2); }}
          className="alta-enlace"
          style={{ alignSelf: 'center', minHeight: 44, color: 'var(--u-text-3)' }}
        >
          Lo hago después
        </button>
      )}

      <WizardNav
        step={step}
        lastStep={LAST_STEP}
        onBack={() => { setStepError(null); setCambiando(null); setStep((s) => Math.max(0, s - 1)); }}
        onNext={next}
        nextLabel={step === 1 ? 'Ver mi carta' : 'Continuar'}
        submitLabel={conPrueba ? 'Iniciar prueba' : esElPrimero ? 'Crear mi restaurante' : 'Crear restaurante'}
        pendingLabel="Creando tu restaurante…"
        isPending={isPending || (!!state && 'url' in state)}
      />

      <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--u-text-4)', margin: 0 }}>
        <Link href="/mi-cuenta" style={{ color: 'var(--brand-accent-ink)', fontWeight: 600, textDecoration: 'none' }}>
          Volver a Mi cuenta
        </Link>
      </p>
    </form>
  );
}
