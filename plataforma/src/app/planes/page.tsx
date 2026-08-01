import Link from 'next/link';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import LeoginLogo from '@/components/leogin-logo';
import PlanBuilder from './components/plan-builder';
import { PLANS, PUBLIC_PLANS, INCLUDED_MODULES, BRANCH_DISCOUNT_TIERS, isAddonAvailable, planPriceLabel } from '@/lib/plans';
import type { PlanCode, PlanPricing } from '@/lib/plans';
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

const ACCENT_BY_PLAN: Record<PlanCode, string> = {
  BASICO: '#94a3b8',
  ESTANDAR: '#10b981',
  PREMIUM: '#6366f1',
  PRO: '#a855f7',
};

const FEATURE_ROWS: { label: string; key: keyof typeof PLANS.BASICO }[] = [
  { label: 'Pedidos online', key: 'hasOrders' },
  { label: 'Notificación WhatsApp', key: 'hasWhatsapp' },
  { label: 'Alertas en tiempo real', key: 'hasRealtime' },
  { label: 'Personalización completa', key: 'hasFullTheme' },
  { label: 'Panel mesero (tablet)', key: 'hasWaiterPanel' },
  { label: 'Impresión de comandas', key: 'hasPrinting' },
  { label: 'Reportes financieros y corte de caja', key: 'hasFinance' },
  { label: 'Analítica, inventario y personal', key: 'hasAnalytics' },
  { label: 'Descuento "plan a tu medida" por canal', key: 'hasChannelDiscount' },
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
      q: '¿Cómo funcionan los módulos a la carta?',
      a: 'Reservaciones, llamar al mesero, encuestas, cupones, lealtad y recetas se pueden activar sobre cualquier plan por su precio individual. Premium ya los incluye todos sin costo extra. Activas solo lo que tu restaurante realmente usa.',
    },
    {
      q: '¿Cuál es la diferencia entre Básico, Estándar y Premium?',
      a: `Básico (${planPriceLabel(pricing, 'BASICO')}) es solo menú digital: tu carta con fotos, precios y QR imprimible, sin pedidos en línea. Estándar (${planPriceLabel(pricing, 'ESTANDAR')}) agrega pedidos en línea con avisos en tiempo real, reportes financieros y corte de caja, eligiendo 2 de los 3 modos (comer en local, para llevar, a domicilio). Premium (${planPriceLabel(pricing, 'PREMIUM')}) incluye los 3 modos de pedido a la vez, panel de mesero, personalización completa, analítica/inventario/personal y todos los módulos disponibles sin costo extra.`,
    },
    {
      q: '¿Cómo funciona Multisucursal / Franquicias?',
      a: 'Cada sucursal paga su propio plan según lo que necesita, con descuento por volumen a partir de la 2a sucursal del grupo (10% con 2-4 sucursales, 15% con 5-9, 20% con 10+). El grupo paga además ' + `Q${pricing.groupPanelFee}/mes` + ' por el panel consolidado que muestra todas las sucursales juntas.',
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
          ? <Icon name="check" size={16} style={{ color: '#4ade80' }} />
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

/** Módulos realmente a la venta hoy (los comingSoon no se cuentan ni se ofrecen). */
const sellableModuleCount = ACTIVATABLE_MODULES.filter((m) => isAddonAvailable(m.key)).length;

export default async function PlanesPage() {
  const pricing = await getEffectivePlanPricing();
  const FAQS = buildFaqs(pricing);
  return (
    <div style={{ width: '100%', minHeight: '100svh' }}>
      {/* Header */}
      <header
        className="glass-solid"
        style={{
          position: 'sticky', top: 0, zIndex: 50,
          borderRadius: 0, borderLeft: 'none', borderRight: 'none', borderTop: 'none',
          height: 56, padding: '0 18px',
          display: 'flex', alignItems: 'center', gap: 12,
        }}
      >
        <Link href="/" style={{ textDecoration: 'none', flex: '0 0 auto' }}>
          <LeoginLogo size={26} />
        </Link>
        <nav style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', gap: 4, alignItems: 'center' }}>
          <Link href="/registro" className="press" style={{
            padding: '7px 16px', borderRadius: 99, fontSize: 13, fontWeight: 700,
            textDecoration: 'none', background: 'var(--brand-accent)', color: '#fff',
          }}>
            Empezar gratis
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section style={{ textAlign: 'center', padding: '60px 18px 48px', maxWidth: 680, margin: '0 auto' }}>
        <div className="t-kicker" style={{ fontSize: 11, marginBottom: 14 }}>Planes y precios</div>
        <h1 className="t-display" style={{ fontSize: 'clamp(28px, 5vw, 44px)', lineHeight: 1.08 }}>
          Precio fijo. <em>Nunca</em> un % de tus ventas
        </h1>
        <p className="t-mute" style={{ fontSize: 15.5, lineHeight: 1.6, marginTop: 16, maxWidth: 540, margin: '16px auto 0' }}>
          Elige un plan según las funciones que necesitas, no según cuánto vendes.
          Añade solo los módulos que tu restaurante realmente usa. Sin tope de ventas,
          sin comisión por pedido, sin cobros sorpresa.
        </p>
        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Link href="/registro" style={{
            padding: '11px 24px', borderRadius: 99, fontSize: 14, fontWeight: 700,
            textDecoration: 'none', background: 'var(--brand-accent)', color: '#fff',
          }}>
            Empieza gratis · sin tarjeta
          </Link>
          <a
            href="#armar-plan"
            style={{
              padding: '11px 24px', borderRadius: 99, fontSize: 14, fontWeight: 600,
              textDecoration: 'none', border: '1.5px solid var(--u-hair)', color: 'var(--u-text-2)',
            }}
          >
            Arma tu plan
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
            const accent = ACCENT_BY_PLAN[code];
            const included = INCLUDED_MODULES[code];
            return (
              <div
                key={code}
                className="glass"
                style={{
                  borderRadius: 20, padding: '24px 22px',
                  display: 'flex', flexDirection: 'column', gap: 18,
                  border: p.highlight ? `2px solid ${accent}` : undefined,
                  position: 'relative',
                }}
              >
                {p.badge && (
                  <div style={{
                    position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)',
                    fontSize: 9.5, fontWeight: 800, letterSpacing: '0.1em', padding: '4px 14px',
                    borderRadius: 99, background: `color-mix(in srgb, ${accent} 18%, transparent)`, color: accent, whiteSpace: 'nowrap',
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
                    { label: 'Añade módulos sueltos si los necesitas', ok: true },
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
                    { label: `${included.length} módulos incluidos gratis`, ok: true },
                    { label: 'Usuarios ilimitados', ok: true },
                  ] : [
                    { label: 'Todo lo de Premium', ok: true },
                    { label: `${included.length} módulos incluidos gratis`, ok: true },
                    { label: 'Soporte prioritario', ok: true },
                    { label: 'Configuración asistida sin costo', ok: true },
                    { label: 'Usuarios ilimitados', ok: true },
                  ]).map(({ label, ok }) => (
                    <li key={label} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5 }}>
                      <span style={{ color: ok ? '#4ade80' : 'var(--u-text-4)', flexShrink: 0 }}>
                        <Icon name={ok ? 'check' : 'x'} size={15} />
                      </span>
                      <span style={{ color: ok ? 'var(--u-text-2)' : 'var(--u-text-4)' }}>{label}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href="/registro"
                  style={{
                    display: 'block', textAlign: 'center', textDecoration: 'none',
                    padding: '11px 0', borderRadius: 12, fontWeight: 700, fontSize: 14,
                    background: p.highlight ? accent : 'var(--surface-3)',
                    color: p.highlight ? '#fff' : 'var(--u-text)',
                    marginTop: 'auto',
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
        <Glass variant="quiet" style={{ borderRadius: 16, padding: '16px 20px' }}>
          <p style={{ fontSize: 13.5, color: 'var(--u-text-3)', lineHeight: 1.6, margin: 0 }}>
            <strong style={{ color: 'var(--u-text-2)' }}>Sin cobro por ventas:</strong>{' '}
            Todos los planes son de precio fijo, sin importar cuántos pedidos recibas ni cuánto
            factures. Subes de plan por las funciones que necesitas — nunca porque tu restaurante
            vendió más este mes.
          </p>
        </Glass>
      </section>

      {/* Módulos a la carta */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '0 18px 56px' }}>
        <h2 className="t-display" style={{ fontSize: 22, marginBottom: 8 }}>Módulos a la carta</h2>
        <p className="t-mute" style={{ fontSize: 14, marginBottom: 24, maxWidth: 620 }}>
          Cada restaurante es distinto. Añade solo lo que necesitas sobre cualquier plan —
          Premium ya los incluye todos sin costo extra.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 14 }}>
          {ACTIVATABLE_MODULES.filter((m) => isAddonAvailable(m.key)).map((m) => {
            const price = pricing.modulePrices[m.key] ?? 0;
            const setupFee = m.key === 'fel' ? pricing.moduleSetupFeeFel : 0;
            return (
              <Glass key={m.key} variant="quiet" style={{ borderRadius: 16, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <Icon name={m.icon} size={17} style={{ color: 'var(--brand-accent-ink)' }} />
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--u-text)' }}>{m.label}</span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--u-text-3)', lineHeight: 1.5, margin: 0, minHeight: 36 }}>{m.description}</p>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--brand-accent-ink)', fontFamily: 'var(--font-display)' }}>
                  {fmtQ(price)}<span style={{ fontSize: 11, fontWeight: 600, color: 'var(--u-text-4)' }}> /mes</span>
                  {setupFee ? <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--u-text-4)' }}> + {fmtQ(setupFee)} activación</span> : null}
                </div>
              </Glass>
            );
          })}
        </div>
      </section>

      {/* Tabla de comparación completa */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '0 18px 64px' }}>
        <h2 className="t-display" style={{ fontSize: 22, marginBottom: 24 }}>Comparación completa</h2>
        <Glass variant="quiet" style={{ overflowX: 'auto', borderRadius: 18 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 620 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--u-hair)' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--u-text-4)', width: '34%' }}>Función</th>
                {PUBLIC_PLANS.map((code) => {
                  const p = PLANS[code];
                  const accent = ACCENT_BY_PLAN[code];
                  return (
                    <th key={code} style={{ padding: '12px 8px', textAlign: 'center', fontSize: 11.5, fontWeight: 700, color: p.highlight ? accent : 'var(--u-text-3)', whiteSpace: 'nowrap' }}>
                      {p.name}
                    </th>
                  );
                })}
              </tr>
              <tr style={{ borderBottom: '1px solid var(--u-hair)', background: 'rgba(255,255,255,0.02)' }}>
                <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--u-text-4)' }}>Precio mensual</td>
                {PUBLIC_PLANS.map((code) => {
                  const accent = ACCENT_BY_PLAN[code];
                  return (
                    <td key={code} style={{ padding: '10px 8px', textAlign: 'center', fontFamily: 'var(--ui-font-mono)', fontWeight: 700, fontSize: 13, color: accent }}>
                      {planPriceLabel(pricing, code)}
                    </td>
                  );
                })}
              </tr>
              <tr style={{ borderBottom: '1px solid var(--u-hair)' }}>
                <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--u-text-4)' }}>Módulos incluidos gratis</td>
                {/* El denominador era un 8 fijo, contando también los módulos
                   que todavía no se ofrecen (comingSoon). Premium salía como
                   "7 de 8" y parecía que faltaba uno por comprar cuando en
                   realidad los trae TODOS los que hay a la venta. */}
                {PUBLIC_PLANS.map((code) => (
                  <td key={code} style={{ padding: '10px 8px', textAlign: 'center', fontSize: 13, fontWeight: 600, color: 'var(--u-text-2)' }}>
                    {INCLUDED_MODULES[code].filter((k) => isAddonAvailable(k)).length} de {sellableModuleCount}
                  </td>
                ))}
              </tr>
              <tr style={{ borderBottom: '1px solid var(--u-hair)', background: 'rgba(255,255,255,0.02)' }}>
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
                <tr key={key} style={{ borderBottom: i < FEATURE_ROWS.length - 1 ? '1px solid var(--u-hair)' : 'none', background: i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
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
        </Glass>
      </section>

      {/* Arma tu plan */}
      <section id="armar-plan" style={{ maxWidth: 780, margin: '0 auto', padding: '0 18px 72px' }}>
        <h2 className="t-display" style={{ fontSize: 22, marginBottom: 8 }}>Arma tu plan</h2>
        <p className="t-mute" style={{ fontSize: 14, marginBottom: 28 }}>
          Elige tu plan base y marca los módulos que quieres — el precio se arma solo, y nunca depende de cuánto vendas.
        </p>
        <Glass variant="quiet" style={{ borderRadius: 20, padding: '28px 24px' }}>
          <PlanBuilder pricing={pricing} />
        </Glass>
      </section>

      {/* Franquicias / multisucursal */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '0 18px 64px' }}>
        <h2 className="t-display" style={{ fontSize: 22, marginBottom: 8 }}>Grupos y franquicias</h2>
        <p className="t-mute" style={{ fontSize: 14, marginBottom: 24, maxWidth: 620 }}>
          Cada sucursal elige el plan que necesita. Mientras más sucursales tengas en tu grupo,
          más barata sale cada una a partir de la segunda.
        </p>
        <Glass variant="quiet" style={{ borderRadius: 18, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--u-hair)' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--u-text-4)' }}>Tamaño del grupo</th>
                <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--u-text-4)' }}>Descuento por sucursal (desde la 2a)</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid var(--u-hair)' }}>
                <td style={{ padding: '11px 16px', color: 'var(--u-text-2)' }}>1 sucursal</td>
                <td style={{ padding: '11px 16px', textAlign: 'right', color: 'var(--u-text-4)' }}>—</td>
              </tr>
              {BRANCH_DISCOUNT_TIERS.slice().reverse().map((tier) => (
                <tr key={tier.label} style={{ borderBottom: '1px solid var(--u-hair)' }}>
                  <td style={{ padding: '11px 16px', color: 'var(--u-text-2)' }}>{tier.label}</td>
                  <td style={{ padding: '11px 16px', textAlign: 'right', fontWeight: 700, color: '#4ade80', fontFamily: 'var(--ui-font-mono)' }}>
                    {Math.round(tier.pct * 100)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Glass>
        <p style={{ fontSize: 12.5, color: 'var(--u-text-4)', marginTop: 14, lineHeight: 1.6 }}>
          El panel de grupo consolidado (ver todas tus sucursales en un solo lugar) cuesta{' '}
          {fmtQ(pricing.groupPanelFee)}/mes, una sola vez por grupo, sin importar cuántas sucursales tengas.
          Para grupos de 10 o más sucursales, escríbenos: armamos un plan a medida.
        </p>
        <a
          href={waLink('Hola, quiero información sobre planes para mi grupo de restaurantes / franquicia')}
          target="_blank"
          rel="noopener noreferrer"
          className="press"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 16,
            padding: '10px 20px', borderRadius: 99, fontWeight: 700, fontSize: 13.5,
            textDecoration: 'none', background: 'var(--surface-3)', color: 'var(--u-text)',
          }}
        >
          <Icon name="sparkle" size={14} />
          Hablar con ventas sobre mi franquicia
        </a>
      </section>

      {/* FAQ */}
      <section style={{ maxWidth: 760, margin: '0 auto', padding: '0 18px 72px' }}>
        <h2 className="t-display" style={{ fontSize: 22, marginBottom: 24 }}>Preguntas frecuentes</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {FAQS.map((faq) => (
            <details key={faq.q} className="glass" style={{ borderRadius: 16, padding: '16px 20px' }}>
              <summary style={{ cursor: 'pointer', listStyle: 'none', fontWeight: 700, fontSize: 14.5, color: 'var(--u-text)', lineHeight: 1.4 }}>
                {faq.q}
              </summary>
              <p style={{ marginTop: 10, fontSize: 14, color: 'var(--u-text-3)', lineHeight: 1.6 }}>{faq.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA Final */}
      <section style={{ maxWidth: 600, margin: '0 auto', padding: '0 18px 80px', textAlign: 'center' }}>
        <Glass variant="quiet" style={{ borderRadius: 24, padding: '40px 28px' }}>
          <div style={{ fontSize: 28, fontWeight: 800, fontFamily: 'var(--font-display)', lineHeight: 1.2, marginBottom: 12 }}>
            ¿Listo para modernizar tu menú?
          </div>
          <p style={{ fontSize: 15, color: 'var(--u-text-3)', lineHeight: 1.6, marginBottom: 24 }}>
            Empieza con {pricing.trialDays} días gratis. Sin tarjeta, sin compromiso.
            Tu menú queda en vivo el mismo día.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Link href="/registro" style={{
              padding: '12px 28px', borderRadius: 99, fontSize: 15, fontWeight: 700,
              textDecoration: 'none', background: 'var(--brand-accent)', color: '#fff',
            }}>
              Crear mi restaurante gratis
            </Link>
            <a
              href={waLink('Hola, quiero una demo de Leogin para mi restaurante')}
              target="_blank" rel="noopener noreferrer"
              style={{
                padding: '12px 28px', borderRadius: 99, fontSize: 15, fontWeight: 600,
                textDecoration: 'none', border: '1.5px solid var(--u-hair)', color: 'var(--u-text-2)',
              }}
            >
              Hablar con ventas
            </a>
          </div>
        </Glass>
      </section>

      {/* Footer mínimo */}
      <footer style={{ textAlign: 'center', padding: '0 18px 32px', fontSize: 12.5, color: 'var(--u-text-4)' }}>
        <Link href="/" style={{ color: 'var(--u-text-4)', textDecoration: 'none' }}>Leogin</Link>
        {' · '}
        <Link href="/" style={{ color: 'var(--u-text-4)', textDecoration: 'none' }}>Inicio</Link>
        {' · '}
        <Link href="/terminos" style={{ color: 'var(--u-text-4)', textDecoration: 'none' }}>Términos</Link>
        {' · '}
        <Link href="/privacidad" style={{ color: 'var(--u-text-4)', textDecoration: 'none' }}>Privacidad</Link>
        {' · '}
        <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: 'var(--u-text-4)', textDecoration: 'none' }}>Contacto</a>
      </footer>
    </div>
  );
}
