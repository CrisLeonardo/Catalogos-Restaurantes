import type { Metadata } from 'next';
import { imagenesWeb } from '@/lib/og-web';
import Link from 'next/link';
import { Icon } from '@/components/icons';
import { conEvento, EVENTOS } from '@/lib/analytics';
import { SiteHeader, SiteFooter, SectionHead, contactHref, CONTACT_ICON, CONTACT_VIA } from '@/components/site-chrome';
import { PLANS, PUBLIC_PLANS, INCLUDED_MODULES, planPriceLabel, planPriceQ, PLAN_ACCENT_INK, publicPlanCapabilities, planPresentation, planGrowthCopy, planComparisonCopy, reglaDelTopeEnLinea } from '@/lib/plans';
import type { PlanPricing } from '@/lib/plans';
import { ACTIVATABLE_MODULES } from '@/lib/modules';
import { getEffectivePlanPricing } from '@/lib/db/billing';
import { fmtMoney } from '@/lib/money';
import { marketingUrl } from '@/lib/tenant';
import { PlanPorPreguntas, type PlanDeLaWeb } from '@/components/landing-planes';
import type { PlanAlta } from '@/lib/alta';
import { AbrirPorAncla } from '@/components/abrir-por-ancla';

const TITULO = 'Planes y precios — Leogin';
const DESCRIPCION = 'Menú digital gratis para siempre, con planes de pedidos en línea a precio fijo — sin cobro por tus ventas.';

/* Canonical y tarjeta propias: sin ellas, compartir /planes por WhatsApp
   no tenía vista previa (auditoría de lanzamiento 2026-11-23, WEB-06). */
export const metadata: Metadata = {
  title: TITULO,
  description: DESCRIPCION,
  alternates: { canonical: marketingUrl('/planes') },
  openGraph: {
    title: TITULO, description: DESCRIPCION, url: marketingUrl('/planes'),
    siteName: 'Leogin', locale: 'es_GT', type: 'website',
    images: imagenesWeb('planes', 'Leogin: precio fijo, nunca un % de tus ventas').og,
  },
  twitter: { ...imagenesWeb('planes', 'Leogin: precio fijo, nunca un % de tus ventas').twitter, title: TITULO, description: DESCRIPCION },
};

// Los precios pueden cambiar desde /super/configuracion: la página se
// regenera sola (ISR) y además savePricingSettings la revalida al guardar.
export const revalidate = 600;



const FEATURE_ROWS = publicPlanCapabilities();

function buildFaqs(pricing: PlanPricing) {
  return [
    {
      q: '¿Por qué no cobran según lo que vendo?',
      a: 'Porque no queremos ser un costo que crece cuando te va mejor. Pagas un precio fijo por el plan, con sus funciones incluidas — igual en un mes flojo que en tu mejor mes. Es la misma razón por la que existimos: reemplazar el modelo de comisión de las apps de delivery por algo predecible.',
    },
    {
      q: '¿Qué pasa si mi restaurante crece mucho?',
      a: planGrowthCopy(pricing),
    },
    {
      q: '¿Qué incluye cada plan?',
      a: 'Cada plan ya trae definido lo suyo — no hay funciones sueltas que comprar aparte. Si vendes solo para llevar y a domicilio y vas empezando, En línea te alcanza; si además tienes mesas o quieres reportes y corte de caja, Estándar; si quieres reservaciones, lealtad, cupones, encuestas y todo lo demás sin ir activando una cosa a la vez, Premium lo incluye todo por su precio fijo.',
    },
    {
      q: '¿Cuál es la diferencia entre los planes?',
      a: planComparisonCopy(pricing),
    },
    {
      q: '¿Cómo funciona Multisucursal / Franquicias?',
      a: 'Cada sucursal paga su propio plan completo según lo que necesita. El grupo paga además ' + `Q${pricing.groupPanelFee}/mes` + ' por el panel consolidado que muestra todas las sucursales juntas.',
    },
    {
      q: '¿Hay periodo de prueba?',
      a: pricing.trialDays > 0
        ? `El plan Básico es gratis para siempre, sin necesidad de probarlo. Estándar y Premium tienen ${pricing.trialDays} días de prueba gratis, sin tarjeta — si decides no continuar, tu menú simplemente se pausa, no hay cobro ni compromiso.`
        : 'El plan Básico es gratis para siempre: con él ya tienes tu menú digital con QR y puedes conocer Leogin sin pagar. Los planes con pedidos se cobran desde que los activas, sin contrato: puedes cancelar cuando quieras.',
    },
  ];
}

/* Una línea por plan para «¿qué plan te conviene?» (la misma que la portada). */
function planesDeLaWeb(pricing: PlanPricing): PlanDeLaWeb[] {
  return PUBLIC_PLANS.map((code) => {
    const gratis = pricing.prices[code] === 0;
    const puntos = planPresentation({ plan: code, pricing }).points.filter((p) => p.positive).map((p) => p.text);
    return {
      code: code as PlanAlta,
      nombre: PLANS[code].name,
      precio: gratis ? 'Gratis' : planPriceQ(pricing, code),
      gratis,
      resumen: puntos.slice(0, 2).join(' · '),
    };
  });
}

function fmtQ(n: number) {
  return fmtMoney(n, 'GTQ', 0);
}

/**
 * Celda de la comparativa de planes.
 *
 * Los iconos de Icon salen con aria-hidden, así que una celda de sí/no era
 * literalmente una celda VACÍA para un lector de pantalla: la tabla que decide
 * la compra no se podía leer. El texto oculto le da a cada celda su valor real
 * sin cambiar nada de lo que se ve.
 */
function PlanFeatureRow({ value }: { value: boolean | number | string }) {
  if (typeof value === 'boolean') {
    return (
      <>
        {/* `display: block` + margen automático: el icono es un bloque y
            `text-align: center` de la celda no lo centraba, así que las ✓/✗
            no caían bajo su plan (auditoría 2026-10-02, WEB-04). */}
        {value
          ? <Icon name="check" size={16} style={{ color: 'var(--c-ok)', display: 'block', margin: '0 auto' }} />
          : <Icon name="x" size={16} style={{ color: 'var(--u-text-4)', display: 'block', margin: '0 auto' }} />}
        <span className="sr-only">{value ? 'Incluido' : 'No incluido'}</span>
      </>
    );
  }
  if (value === 'unlimited') {
    return (
      <span style={{ fontSize: 13, color: 'var(--u-text-2)', fontWeight: 600 }}>
        <span aria-hidden>∞</span>
        <span className="sr-only">Ilimitados</span>
      </span>
    );
  }
  return <span style={{ fontSize: 13, color: 'var(--u-text-2)', fontWeight: 600 }}>{String(value)}</span>;
}

export default async function PlanesPage() {
  const pricing = await getEffectivePlanPricing();
  const FAQS = buildFaqs(pricing);
  return (
    <div style={{ width: '100%', minHeight: '100svh' }}>
      <SiteHeader />

      {/* Sin <main> la página entera quedaba fuera de una región principal y
          el salto al contenido no tenía destino (WEB-UX-09). */}
      <main id="contenido" tabIndex={-1}>
      {/* Hero */}
      <section className="lp-shell" style={{ textAlign: 'center', padding: 'clamp(48px, 7vw, 88px) 20px clamp(36px, 5vw, 56px)' }}>
        <div className="lp-eyebrow">Planes y precios</div>
        <h1 className="lp-h1" style={{ fontSize: 'clamp(32px, 5.2vw, 54px)', marginTop: 16, maxWidth: 760, marginInline: 'auto' }}>
          Precio fijo. <span style={{ color: 'var(--brand-accent-ink)' }}>Nunca</span> un % de tus ventas
        </h1>
        <p className="lp-lead" style={{ margin: '18px auto 0', maxWidth: 600 }}>
          Eliges plan por cómo trabajas, no por cuánto vendes: sin comisión por pedido y sin cobros sorpresa.
        </p>
      </section>

      {/* ¿Qué plan te conviene? (V.3, línea N 2026-11-18): la pregunta marca
          el plan y los cuatro caben en una tarjeta con el precio en una
          línea. Antes eran cuatro tarjetas largas que había que leer enteras. */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '0 18px 24px' }}>
        <PlanPorPreguntas planes={planesDeLaWeb(pricing)} origen="planes" contacto={{ href: contactHref('Hola, tengo dudas sobre qué plan de Leogin me conviene'), via: CONTACT_VIA }} />
      </section>

      {/* Nota de uso justo */}
      <section style={{ maxWidth: 760, margin: '0 auto', padding: '0 18px 52px' }}>
        <div className="lp-card-quiet" style={{ padding: '18px 22px' }}>
          <p style={{ fontSize: 13.5, color: 'var(--u-text-3)', lineHeight: 1.6, margin: 0 }}>
            <strong style={{ color: 'var(--u-text-2)' }}>Sin cobro por ventas:</strong>{' '}
            ningún plan cobra comisión ni un porcentaje de lo que facturas. {reglaDelTopeEnLinea()}
          </p>
        </div>
      </section>

      {/* Lo que incluye Premium */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '0 18px 16px' }}>
        <details className="lp-incluye">
          <summary className="lp-btn lp-btn-soft">
            Lo que incluye Premium <Icon name="chevronDown" size={16} />
          </summary>
          <div style={{ height: 14 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 14 }}>
          {ACTIVATABLE_MODULES.filter((m) => INCLUDED_MODULES.PREMIUM.includes(m.key)).map((m) => (
            <div key={m.key} className="lp-card lp-card-lift" style={{ borderRadius: 18, padding: '17px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <Icon name={m.icon} size={17} style={{ color: 'var(--brand-accent-ink)' }} />
                <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--u-text)' }}>{m.label}</span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--u-text-3)', lineHeight: 1.5, margin: 0 }}>{m.description}</p>
            </div>
          ))}
        </div>
        </details>
      </section>

      {/* Tabla de comparación completa */}
      <section id="comparativa" style={{ maxWidth: 1100, margin: '0 auto', padding: '0 18px 64px', scrollMarginTop: 84 }}>
        <AbrirPorAncla id="comparativa" />
        <details className="lp-incluye">
          <summary className="lp-btn lp-btn-soft">
            Ver todo lado a lado <Icon name="chevronDown" size={16} />
          </summary>
          <div style={{ height: 14 }} />
        {/* En el teléfono la tabla (620 px) se desliza dentro de su tarjeta:
            la columna de la función se queda fija para no perder qué fila se
            lee, y la caja se puede recorrer con las flechas (WEB-UX-04). */}
        <div className="lp-card lp-comparativa" style={{ overflowX: 'auto' }} tabIndex={0} role="region" aria-label="Comparativa de los cuatro planes">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 620 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--u-hair)' }}>
                <th scope="col" style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--u-text-4)' }}>Función</th>
                {PUBLIC_PLANS.map((code) => {
                  const p = PLANS[code];
                  return (
                    <th key={code} scope="col" style={{ padding: '12px 8px', textAlign: 'center', fontSize: 11.5, fontWeight: 700, color: p.highlight ? PLAN_ACCENT_INK[code] : 'var(--u-text-3)', whiteSpace: 'nowrap' }}>
                      {p.name}
                    </th>
                  );
                })}
              </tr>
              <tr style={{ borderBottom: '1px solid var(--u-hair)', background: 'color-mix(in srgb, var(--u-text) 3.5%, transparent)' }}>
                <th scope="row" style={{ padding: '10px 16px', fontSize: 12, fontWeight: 400, textAlign: 'left', color: 'var(--u-text-4)', background: 'color-mix(in srgb, var(--u-text) 3.5%, var(--lp-card))' }}>Precio mensual</th>
                {PUBLIC_PLANS.map((code) => {
                  return (
                    <td key={code} style={{ padding: '10px 8px', textAlign: 'center', fontFamily: 'var(--ui-font-mono)', fontWeight: 700, fontSize: 13, color: PLAN_ACCENT_INK[code] }}>
                      {planPriceLabel(pricing, code)}
                    </td>
                  );
                })}
              </tr>
              <tr style={{ borderBottom: '1px solid var(--u-hair)', background: 'color-mix(in srgb, var(--u-text) 3.5%, transparent)' }}>
                <th scope="row" style={{ padding: '10px 16px', fontSize: 12, fontWeight: 400, textAlign: 'left', color: 'var(--u-text-4)', background: 'color-mix(in srgb, var(--u-text) 3.5%, var(--lp-card))' }}>Usuarios del panel</th>
                {PUBLIC_PLANS.map((code) => {
                  const p = PLANS[code];
                  return (
                    <td key={code} style={{ padding: '10px 8px', textAlign: 'center', fontSize: 13, fontWeight: 600, color: 'var(--u-text-2)' }}>
                      {p.users === 'unlimited'
                        ? <><span aria-hidden>∞</span><span className="sr-only">Ilimitados</span></>
                        : String(p.users)}
                    </td>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {(['orderScope', 'productsLabel', 'policy'] as const).map((key) => (
                <tr key={key} style={{ borderBottom: '1px solid var(--u-hair)' }}>
                  <th scope="row" style={{ padding: '10px 16px', fontSize: 13, fontWeight: 400, textAlign: 'left', color: 'var(--u-text-3)' }}>
                    {key === 'orderScope' ? 'Modalidades de pedido' : key === 'productsLabel' ? 'Platillos' : 'Límite de pedidos'}
                  </th>
                  {PUBLIC_PLANS.map((code) => <td key={code} style={{ padding: '10px 8px', textAlign: 'center', fontSize: 12 }}>{planPresentation({ plan: code, pricing })[key]}</td>)}
                </tr>
              ))}
              {FEATURE_ROWS.map(({ label, key }, i) => (
                <tr key={key} style={{ borderBottom: i < FEATURE_ROWS.length - 1 ? '1px solid var(--u-hair)' : 'none', background: i % 2 === 0 ? 'color-mix(in srgb, var(--u-text) 2.5%, transparent)' : 'transparent' }}>
                  <th scope="row" style={{ padding: '10px 16px', fontSize: 13, fontWeight: 400, textAlign: 'left', color: 'var(--u-text-3)', background: i % 2 === 0 ? 'color-mix(in srgb, var(--u-text) 2.5%, var(--lp-card))' : 'var(--lp-card)' }}>{label}</th>
                  {PUBLIC_PLANS.map((code) => {
                    const val = planPresentation({ plan: code, pricing }).capabilities.find((item) => item.key === key)!.included;
                    return (
                      <td key={code} style={{ padding: '10px 8px', textAlign: 'center' }}>
                        <PlanFeatureRow value={val as boolean | number | string} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </details>
      </section>

      {/* Franquicias / multisucursal */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '0 18px 64px' }}>
        <SectionHead
          eyebrow="Grupos y franquicias"
          title="Varias sucursales, un solo panel"
          lead="Cada sucursal elige el plan que necesita y paga el suyo. El panel de grupo, para verlas todas juntas, se cobra una sola vez por grupo."
        />
        <p style={{ fontSize: 12.5, color: 'var(--u-text-4)', marginTop: 14, lineHeight: 1.6 }}>
          El panel de grupo consolidado (ver todas tus sucursales en un solo lugar) cuesta{' '}
          {fmtQ(pricing.groupPanelFee)}/mes, una sola vez por grupo, sin importar cuántas sucursales tengas.
          Para grupos grandes, escríbenos: armamos un plan a medida.
        </p>
        <a
          href={contactHref('Hola, quiero información sobre planes para mi grupo de restaurantes / franquicia')}
          target="_blank"
          rel="noopener noreferrer"
          className="lp-btn lp-btn-soft"
          style={{ marginTop: 18 }}
        >
          <Icon name="sparkle" size={14} />
          Hablar con ventas sobre mi franquicia
        </a>
      </section>

      {/* FAQ */}
      <section style={{ maxWidth: 760, margin: '0 auto', padding: '0 18px 72px' }}>
        <SectionHead eyebrow="Dudas" title="Preguntas frecuentes" />
        <div style={{ marginTop: 20 }}>
          {FAQS.map((faq, i) => (
            <details key={faq.q} className="lp-faq" open={i === 0}>
              <summary>
                {faq.q}
                <Icon name="chevronDown" size={18} className="lp-faq-mark" />
              </summary>
              <p className="lp-body lp-faq-body">{faq.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA Final */}
      <section style={{ maxWidth: 600, margin: '0 auto', padding: '0 18px 80px', textAlign: 'center' }}>
        <div className="lp-card" style={{ padding: 'clamp(34px, 5vw, 48px) 28px', boxShadow: 'var(--lp-shadow-md)' }}>
          <h2 className="lp-h2" style={{ fontSize: 'clamp(24px, 3.2vw, 32px)' }}>
            ¿Listo para modernizar tu restaurante?
          </h2>
          <p className="lp-lead" style={{ fontSize: 15.5, margin: '14px auto 26px', maxWidth: 440 }}>
            {pricing.trialDays > 0
              ? `Empieza con ${pricing.trialDays} días gratis. Sin tarjeta, sin compromiso, y tu menú queda en vivo el mismo día.`
              : 'Empieza con tu menú digital gratis. Sin contrato, y tu restaurante queda en vivo el mismo día.'}
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Link href="/registro" {...conEvento('lp-btn lp-btn-primary', EVENTOS.clicCrear, 'planes abajo')}>
              Crear mi restaurante gratis
            </Link>
            <a
              href={contactHref('Hola, quiero una demo de Leogin para mi restaurante')}
              target="_blank" rel="noopener noreferrer"
              className="lp-btn lp-btn-soft"
            >
              <Icon name={CONTACT_ICON} size={16} /> Hablar con ventas
            </a>
          </div>
        </div>
      </section>
      </main>

      <SiteFooter />
    </div>
  );
}
