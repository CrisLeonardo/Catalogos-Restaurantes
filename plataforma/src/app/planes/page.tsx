import Link from 'next/link';
import { Icon } from '@/components/icons';
import { SiteHeader, SiteFooter, SectionHead } from '@/components/site-chrome';
import { PLANS, PUBLIC_PLANS, INCLUDED_MODULES, planPriceLabel, PLAN_ACCENT, PLAN_ACCENT_INK } from '@/lib/plans';
import type { PlanPricing } from '@/lib/plans';
import { ACTIVATABLE_MODULES } from '@/lib/modules';
import { getEffectivePlanPricing } from '@/lib/db/billing';

export const metadata = {
  title: 'Planes y precios — Leogin',
  description: 'Menú digital gratis para siempre, con planes de pedidos en línea a precio fijo — sin cobro por tus ventas.',
};

// Los precios pueden cambiar desde /super/configuracion: la página se
// regenera sola (ISR) y además savePricingSettings la revalida al guardar.
export const revalidate = 600;

const CONTACT_WA = process.env.NEXT_PUBLIC_CONTACT_WHATSAPP;
const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? 'crisleonardo100@gmail.com';

function waLink(msg: string) {
  if (CONTACT_WA) return `https://wa.me/${CONTACT_WA}?text=${encodeURIComponent(msg)}`;
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(msg)}`;
}


const FEATURE_ROWS: { label: string; key: keyof typeof PLANS.BASICO }[] = [
  { label: 'Pedidos online', key: 'hasOrders' },
  { label: 'Notificación WhatsApp', key: 'hasWhatsapp' },
  { label: 'Alertas en tiempo real', key: 'hasRealtime' },
  { label: 'Personalización completa', key: 'hasFullTheme' },
  { label: 'Panel mesero (tablet)', key: 'hasWaiterPanel' },
  { label: 'Impresión de comandas', key: 'hasPrinting' },
  { label: 'Reportes financieros y corte de caja', key: 'hasFinance' },
  { label: 'Analítica, inventario y personal', key: 'hasAnalytics' },
];

function buildFaqs(pricing: PlanPricing) {
  return [
    {
      q: '¿Por qué no cobran según lo que vendo?',
      a: 'Porque no queremos ser un costo que crece cuando te va mejor. Pagas un precio fijo por el plan y los módulos que usas — igual en un mes flojo que en tu mejor mes. Es la misma razón por la que existimos: reemplazar el modelo de comisión de las apps de delivery (18-30% por pedido) por algo predecible.',
    },
    {
      q: '¿Qué pasa si mi restaurante crece mucho?',
      a: 'Nada cambia en tu cobro. No hay tope de ventas ni de pedidos en ningún plan. Solo subes de plan cuando necesitas más funciones (más usuarios, panel de mesero, facturación electrónica) — nunca porque vendiste más.',
    },
    {
      q: '¿Qué incluye cada plan?',
      a: 'Cada plan ya trae definido lo suyo — no hay módulos sueltos que comprar aparte. Si solo necesitas lo básico para vender en línea, Estándar te alcanza; si quieres reservaciones, lealtad, cupones, encuestas y todo lo demás sin ir activando una cosa a la vez, Premium lo incluye todo por su precio fijo.',
    },
    {
      q: '¿Cuál es la diferencia entre Básico, Estándar y Premium?',
      a: `Básico (${planPriceLabel(pricing, 'BASICO')}) es solo menú digital: tu carta con fotos, precios y QR imprimible, sin pedidos en línea. Estándar (${planPriceLabel(pricing, 'ESTANDAR')}) agrega pedidos en línea con avisos en tiempo real, reportes financieros y corte de caja, eligiendo 2 de los 3 modos (comer en local, para llevar, a domicilio). Premium (${planPriceLabel(pricing, 'PREMIUM')}) incluye los 3 modos de pedido a la vez, panel de mesero, personalización completa, analítica/inventario/personal y todos los módulos disponibles.`,
    },
    {
      q: '¿Cómo funciona Multisucursal / Franquicias?',
      a: 'Cada sucursal paga su propio plan completo según lo que necesita. El grupo paga además ' + `Q${pricing.groupPanelFee}/mes` + ' por el panel consolidado que muestra todas las sucursales juntas.',
    },
    {
      q: '¿Hay periodo de prueba?',
      a: `El plan Básico es gratis para siempre, sin necesidad de probarlo. Estándar y Premium tienen ${pricing.trialDays} días de prueba gratis, sin tarjeta — si decides no continuar, tu menú simplemente se pausa, no hay cobro ni compromiso.`,
    },
  ];
}

function fmtQ(n: number) {
  return 'Q' + n.toLocaleString('es-GT', { maximumFractionDigits: 0 });
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
        {value
          ? <Icon name="check" size={16} style={{ color: 'var(--c-ok)' }} />
          : <Icon name="x" size={16} style={{ color: 'var(--u-text-4)' }} />}
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

      {/* Hero */}
      <section className="lp-shell" style={{ textAlign: 'center', padding: 'clamp(48px, 7vw, 88px) 20px clamp(36px, 5vw, 56px)' }}>
        <div className="lp-eyebrow">Planes y precios</div>
        <h1 className="lp-h1" style={{ fontSize: 'clamp(32px, 5.2vw, 54px)', marginTop: 16, maxWidth: 760, marginInline: 'auto' }}>
          Precio fijo. <span style={{ color: 'var(--brand-accent-ink)' }}>Nunca</span> un % de tus ventas
        </h1>
        <p className="lp-lead" style={{ margin: '18px auto 0', maxWidth: 600 }}>
          Eliges plan por las funciones que necesitas, no por cuánto vendes. Cada plan ya trae
          definido lo suyo, sin ir activando módulos uno por uno. Sin tope de ventas, sin comisión
          por pedido y sin cobros sorpresa.
        </p>
        <div style={{ marginTop: 28, display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/registro" className="lp-btn lp-btn-primary">
            Empieza gratis · sin tarjeta
          </Link>
          <a href="#comparativa" className="lp-btn lp-btn-soft">
            Ver comparativa
          </a>
        </div>
      </section>

      {/* Tarjetas de los planes */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '0 18px 24px' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 20,
          alignItems: 'start',
        }}>
          {PUBLIC_PLANS.map((code) => {
            const p = PLANS[code];
            const accent = PLAN_ACCENT[code];
            const included = INCLUDED_MODULES[code];
            return (
              <div
                key={code}
                className="lp-card"
                style={{
                  padding: '26px 22px',
                  display: 'flex', flexDirection: 'column', gap: 18,
                  ...(p.highlight
                    ? { border: `1.5px solid ${accent}`, boxShadow: 'var(--lp-shadow-lg)' }
                    : {}),
                }}
              >
                {p.badge && (
                  <div style={{
                    position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)',
                    fontSize: 9.5, fontWeight: 800, letterSpacing: '0.1em', padding: '5px 14px',
                    borderRadius: 99, whiteSpace: 'nowrap',
                    background: p.highlight ? accent : '#fff',
                    color: p.highlight ? '#fff' : PLAN_ACCENT_INK[code],
                    border: p.highlight ? 'none' : `1px solid color-mix(in srgb, ${accent} 34%, transparent)`,
                    boxShadow: 'var(--lp-shadow-sm)',
                  }}>
                    {p.badge}
                  </div>
                )}

                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--u-text)', fontFamily: 'var(--font-display)' }}>{p.name}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--u-text-3)', marginTop: 4, lineHeight: 1.4 }}>{p.tagline}</div>
                </div>

                <div>
                  <div style={{ fontSize: 32, fontWeight: 800, color: accent, fontFamily: 'var(--font-display)', lineHeight: 1 }}>
                    {planPriceLabel(pricing, code)}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--u-text-4)', marginTop: 5 }}>
                    {p.hasOrders ? 'Sin límite de ventas' : 'Menú digital · sin pedidos'}
                  </div>
                </div>

                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {(code === 'BASICO' ? [
                    { label: 'Menú digital con QR imprimible', ok: true },
                    { label: `Hasta ${PLANS.BASICO.maxProducts} productos`, ok: true },
                    { label: 'Tu logo y color de marca', ok: true },
                    { label: 'Pedidos en línea', ok: false },
                  ] : code === 'ESTANDAR' ? [
                    { label: 'Todo lo del Básico', ok: true },
                    { label: 'Elige 2 de 3 modos de pedido', ok: true },
                    { label: 'WhatsApp y panel en tiempo real', ok: true },
                    { label: 'Hasta 2 usuarios del panel', ok: true },
                    { label: 'Comer en local, para llevar y a domicilio juntos', ok: false },
                  ] : code === 'PREMIUM' ? [
                    { label: 'Todo lo del Estándar', ok: true },
                    { label: 'Para llevar, comer en local y delivery', ok: true },
                    { label: 'Panel de mesero, mesas e impresión', ok: true },
                    { label: `Reservaciones, lealtad, cupones y ${included.length - 3} más incluidos`, ok: true },
                    { label: 'Usuarios ilimitados', ok: true },
                  ] : [
                    { label: 'Todo lo de Premium', ok: true },
                    { label: 'Facturación electrónica y proveedores incluidos', ok: true },
                    { label: 'Soporte prioritario', ok: true },
                    { label: 'Configuración asistida sin costo', ok: true },
                    { label: 'Usuarios ilimitados', ok: true },
                  ]).map(({ label, ok }) => (
                    <li key={label} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5 }}>
                      <span style={{ color: ok ? 'var(--c-ok)' : 'var(--u-text-4)', flexShrink: 0 }}>
                        <Icon name={ok ? 'check' : 'x'} size={15} />
                      </span>
                      <span style={{ color: ok ? 'var(--u-text-2)' : 'var(--u-text-4)' }}>{label}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href="/registro"
                  className={`lp-btn ${p.highlight ? '' : 'lp-btn-soft'}`}
                  style={{
                    width: '100%', marginTop: 'auto',
                    ...(p.highlight
                      ? { background: accent, color: '#fff', boxShadow: `0 8px 22px color-mix(in srgb, ${accent} 28%, transparent)` }
                      : {}),
                  }}
                >
                  {code === 'BASICO' ? 'Empezar con Básico' : `Elegir ${p.name}`}
                </Link>
              </div>
            );
          })}
        </div>
      </section>

      {/* Nota de uso justo */}
      <section style={{ maxWidth: 760, margin: '0 auto', padding: '0 18px 52px' }}>
        <div className="lp-card-quiet" style={{ padding: '18px 22px' }}>
          <p style={{ fontSize: 13.5, color: 'var(--u-text-3)', lineHeight: 1.6, margin: 0 }}>
            <strong style={{ color: 'var(--u-text-2)' }}>Sin cobro por ventas:</strong>{' '}
            Todos los planes son de precio fijo, sin importar cuántos pedidos recibas ni cuánto
            factures. Subes de plan por las funciones que necesitas — nunca porque tu restaurante
            vendió más este mes.
          </p>
        </div>
      </section>

      {/* Lo que incluye Premium */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '0 18px 56px' }}>
        <SectionHead
          eyebrow="Incluido en Premium"
          title="Todas estas herramientas, en un solo precio fijo"
          lead="Sin activar módulos uno por uno ni pagar aparte por cada cosa: Premium las trae todas."
        />
        <div style={{ height: 26 }} />
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
      </section>

      {/* Tabla de comparación completa */}
      <section id="comparativa" style={{ maxWidth: 1100, margin: '0 auto', padding: '0 18px 64px' }}>
        <SectionHead eyebrow="Comparativa" title="Todo lado a lado" />
        <div style={{ height: 26 }} />
        <div className="lp-card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 620 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--u-hair)' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--u-text-4)', width: '34%' }}>Función</th>
                {PUBLIC_PLANS.map((code) => {
                  const p = PLANS[code];
                  return (
                    <th key={code} style={{ padding: '12px 8px', textAlign: 'center', fontSize: 11.5, fontWeight: 700, color: p.highlight ? PLAN_ACCENT_INK[code] : 'var(--u-text-3)', whiteSpace: 'nowrap' }}>
                      {p.name}
                    </th>
                  );
                })}
              </tr>
              <tr style={{ borderBottom: '1px solid var(--u-hair)', background: 'color-mix(in srgb, var(--u-text) 3.5%, transparent)' }}>
                <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--u-text-4)' }}>Precio mensual</td>
                {PUBLIC_PLANS.map((code) => {
                  return (
                    <td key={code} style={{ padding: '10px 8px', textAlign: 'center', fontFamily: 'var(--ui-font-mono)', fontWeight: 700, fontSize: 13, color: PLAN_ACCENT_INK[code] }}>
                      {planPriceLabel(pricing, code)}
                    </td>
                  );
                })}
              </tr>
              <tr style={{ borderBottom: '1px solid var(--u-hair)', background: 'color-mix(in srgb, var(--u-text) 3.5%, transparent)' }}>
                <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--u-text-4)' }}>Usuarios del panel</td>
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
              {FEATURE_ROWS.map(({ label, key }, i) => (
                <tr key={key} style={{ borderBottom: i < FEATURE_ROWS.length - 1 ? '1px solid var(--u-hair)' : 'none', background: i % 2 === 0 ? 'color-mix(in srgb, var(--u-text) 2.5%, transparent)' : 'transparent' }}>
                  <td style={{ padding: '10px 16px', fontSize: 13, color: 'var(--u-text-3)' }}>{label}</td>
                  {PUBLIC_PLANS.map((code) => {
                    const val = PLANS[code][key];
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
          href={waLink('Hola, quiero información sobre planes para mi grupo de restaurantes / franquicia')}
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
            Empieza con {pricing.trialDays} días gratis. Sin tarjeta, sin compromiso, y tu menú
            queda en vivo el mismo día.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Link href="/registro" className="lp-btn lp-btn-primary">
              Crear mi restaurante gratis
            </Link>
            <a
              href={waLink('Hola, quiero una demo de Leogin para mi restaurante')}
              target="_blank" rel="noopener noreferrer"
              className="lp-btn lp-btn-soft"
            >
              <Icon name="whatsapp" size={16} /> Hablar con ventas
            </a>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
