import Link from 'next/link';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import LeoginLogo from '@/components/leogin-logo';
import GmvCalculator from './components/gmv-calculator';
import { PLANS, PUBLIC_PLANS } from '@/lib/plans';
import type { PlanCode } from '@/lib/plans';

export const metadata = {
  title: 'Planes y precios — Leogin',
  description: 'Menú digital con pedidos en línea para tu restaurante. Planes desde Q299/mes con 30 días de prueba gratis.',
};

const CONTACT_WA = process.env.NEXT_PUBLIC_CONTACT_WHATSAPP;
const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? 'crisleonardo100@gmail.com';

function waLink(msg: string) {
  if (CONTACT_WA) return `https://wa.me/${CONTACT_WA}?text=${encodeURIComponent(msg)}`;
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(msg)}`;
}

const ACCENT_BY_PLAN: Record<PlanCode, string> = {
  BASICO:        '#94a3b8',
  PREMIUM:       '#6366f1',
  PREMIUM_PRO:   '#a855f7',
  PREMIUM_ULTRA: '#14b8a6',
  ALTO_VOLUMEN:  '#f97316',
  VARIABLE:      '#f59e0b',
};

const FEATURE_ROWS: { label: string; key: keyof typeof PLANS.BASICO }[] = [
  { label: 'Pedidos online', key: 'hasOrders' },
  { label: 'Notificación WhatsApp', key: 'hasWhatsapp' },
  { label: 'Alertas en tiempo real', key: 'hasRealtime' },
  { label: 'Personalización completa', key: 'hasFullTheme' },
  { label: 'Panel mesero (tablet)', key: 'hasWaiterPanel' },
  { label: 'Llamar al mesero (QR)', key: 'hasWaiterCall' },
  { label: 'Encuestas de satisfacción', key: 'hasSurveys' },
  { label: 'Reservaciones', key: 'hasReservations' },
  { label: 'Cupones y descuentos', key: 'hasCoupons' },
  { label: 'Programa de lealtad', key: 'hasLoyalty' },
  { label: 'Impresión de comandas', key: 'hasPrinting' },
  { label: 'Estadísticas y reportes', key: 'hasAnalytics' },
  { label: 'Módulo de recetas', key: 'hasRecipes' },
  { label: 'Módulo de proveedores', key: 'hasSuppliers' },
  { label: 'Factura electrónica (FEL)', key: 'hasFEL' },
];

const FAQS = [
  {
    q: '¿Qué es el límite de ventas digitales (GMV)?',
    a: 'Es el total en quetzales de los pedidos que tus clientes hacen a través de tu menú digital Leogin en un mes. Un pedido de Q800 cuenta como Q800, sin importar cuántas personas lo compartieron.',
  },
  {
    q: '¿Qué pasa si supero el límite de mi plan?',
    a: 'Te avisamos antes. Los pedidos nunca se bloquean automáticamente. Cuando superas el límite de manera consistente, te contactamos para ajustar tu plan juntos. Sin cobros sorpresa.',
  },
  {
    q: '¿Por qué el precio se basa en ventas y no en pedidos?',
    a: 'Porque un pedido puede ser de Q50 o de Q2,000. Con el modelo GMV pagas en proporción al valor real que obtienes de la plataforma. Si tuviste un mes difícil con menos ventas, pagas proporcionalmente menos.',
  },
  {
    q: '¿Qué incluye el plan Básico?',
    a: 'Un menú digital interactivo con hasta 30 productos, pedidos para llevar con hasta Q10,000 en ventas digitales al mes, botón "Llamar al mesero" en el QR, tu logo y color de marca, y código QR listo para imprimir.',
  },
  {
    q: '¿Cómo funciona Multisucursal?',
    a: 'Cada sucursal tiene su propio plan según sus ventas. Adicionalmente, el grupo paga Q250/mes por el panel consolidado que permite ver todas las sucursales en un solo lugar.',
  },
];

const BADGE_COLORS: Record<string, { bg: string; color: string }> = {
  'MÁS POPULAR': { bg: 'rgba(99,102,241,0.15)', color: '#6366f1' },
  'PARA CRECER': { bg: 'rgba(168,85,247,0.15)', color: '#a855f7' },
  'MEJOR VALOR': { bg: 'rgba(20,184,166,0.15)', color: '#14b8a6' },
};

function fmtQ(n: number) {
  return 'Q' + n.toLocaleString('es-GT', { maximumFractionDigits: 0 });
}

function PlanFeatureRow({ value }: { value: boolean | number | string }) {
  if (typeof value === 'boolean') {
    return value ? (
      <Icon name="check" size={16} style={{ color: '#4ade80' }} />
    ) : (
      <Icon name="x" size={16} style={{ color: 'var(--u-text-4)' }} />
    );
  }
  return <span style={{ fontSize: 13, color: 'var(--u-text-2)', fontWeight: 600 }}>{value === 'unlimited' ? '∞' : String(value)}</span>;
}

export default function PlanesPage() {
  const mainPlans: PlanCode[] = ['BASICO', 'PREMIUM', 'PREMIUM_PRO'];
  const extendedPlans: PlanCode[] = ['PREMIUM_ULTRA', 'ALTO_VOLUMEN'];

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
          El precio crece <em>con</em> tu restaurante
        </h1>
        <p className="t-mute" style={{ fontSize: 15.5, lineHeight: 1.6, marginTop: 16, maxWidth: 520, margin: '16px auto 0' }}>
          Pagas en proporción al volumen de ventas que gestionas con Leogin.
          Cuando vendes más, pagamos más juntos. Cuando vendes menos, pagas menos.
        </p>
        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Link href="/registro" style={{
            padding: '11px 24px', borderRadius: 99, fontSize: 14, fontWeight: 700,
            textDecoration: 'none', background: 'var(--brand-accent)', color: '#fff',
          }}>
            30 días gratis · sin tarjeta
          </Link>
          <a
            href="#calculadora"
            style={{
              padding: '11px 24px', borderRadius: 99, fontSize: 14, fontWeight: 600,
              textDecoration: 'none', border: '1.5px solid var(--u-hair)', color: 'var(--u-text-2)',
            }}
          >
            Calcular mi plan
          </a>
        </div>
      </section>

      {/* Tarjetas principales (Básico · Premium · Premium Pro) */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '0 18px 40px' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 20,
          alignItems: 'start',
        }}>
          {mainPlans.map((code) => {
            const p = PLANS[code];
            const accent = ACCENT_BY_PLAN[code];
            const badge = p.badge ? BADGE_COLORS[p.badge] : null;
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
                {p.badge && badge && (
                  <div style={{
                    position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)',
                    fontSize: 9.5, fontWeight: 800, letterSpacing: '0.1em', padding: '4px 14px',
                    borderRadius: 99, background: badge.bg, color: badge.color, whiteSpace: 'nowrap',
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
                    {p.priceLabel}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--u-text-4)', marginTop: 5 }}>{p.gmvLimitLabel}</div>
                </div>

                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {[
                    { label: code === 'BASICO' ? 'Pedidos para llevar (hasta Q10k/mes)' : 'Pedidos online', ok: p.hasOrders },
                    ...(code === 'BASICO'
                      ? [{ label: 'Llamar al mesero (QR)', ok: true }]
                      : [{ label: p.hasWhatsapp ? 'Notificación WhatsApp' : 'Sin WhatsApp', ok: p.hasWhatsapp }]
                    ),
                    { label: p.hasRealtime ? 'Alertas en tiempo real' : 'Sin alertas tiempo real', ok: p.hasRealtime },
                    { label: p.hasFullTheme ? 'Personalización completa' : 'Personalización básica', ok: p.hasFullTheme },
                    { label: p.hasWaiterPanel ? 'Panel de mesero' : 'Sin panel mesero', ok: p.hasWaiterPanel },
                    { label: typeof p.products === 'number' ? `Hasta ${p.products} productos` : 'Productos ilimitados', ok: true },
                    { label: typeof p.users === 'number' ? `Hasta ${p.users} usuario${p.users !== 1 ? 's' : ''}` : 'Usuarios ilimitados', ok: true },
                    ...(code !== 'BASICO' ? [
                      { label: 'Cupones, lealtad y encuestas', ok: true },
                      { label: 'Estadísticas y reportes', ok: true },
                    ] : []),
                    ...(code === 'PREMIUM_PRO' ? [{ label: 'Módulo de proveedores', ok: true }] : []),
                  ].map(({ label, ok }) => (
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
                  {code === 'BASICO' ? 'Empezar con Básico' : code === 'PREMIUM' ? 'Elegir Premium' : 'Elegir Premium Pro'}
                </Link>
              </div>
            );
          })}
        </div>
      </section>

      {/* Planes extendidos (expandibles via details/summary) */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '0 18px 48px' }}>
        <details>
          <summary style={{
            cursor: 'pointer', listStyle: 'none', padding: '14px 0', fontSize: 14.5, fontWeight: 700,
            color: 'var(--u-text-2)', display: 'flex', alignItems: 'center', gap: 8, userSelect: 'none',
          }}>
            <Icon name="chevronDown" size={18} />
            Ver planes para alto volumen — Premium Ultra y Alto Volumen
          </summary>

          <div style={{ paddingTop: 16 }}>
            <div style={{ fontSize: 13, color: 'var(--u-text-3)', marginBottom: 20, fontStyle: 'italic' }}>
              Para restaurantes con alta afluencia y ventas digitales superiores a Q40,000/mes.
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 20, alignItems: 'start',
            }}>
              {extendedPlans.map((code) => {
                const p = PLANS[code];
                const accent = ACCENT_BY_PLAN[code];
                const badge = p.badge ? BADGE_COLORS[p.badge] : null;
                return (
                  <div key={code} className="glass" style={{ borderRadius: 20, padding: '24px 22px', display: 'flex', flexDirection: 'column', gap: 18, position: 'relative' }}>
                    {p.badge && badge && (
                      <div style={{
                        position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)',
                        fontSize: 9.5, fontWeight: 800, letterSpacing: '0.1em', padding: '4px 14px',
                        borderRadius: 99, background: badge.bg, color: badge.color, whiteSpace: 'nowrap',
                      }}>
                        {p.badge}
                      </div>
                    )}
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-display)' }}>{p.name}</div>
                      <div style={{ fontSize: 12.5, color: 'var(--u-text-3)', marginTop: 4, lineHeight: 1.4 }}>{p.tagline}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 32, fontWeight: 800, color: accent, fontFamily: 'var(--font-display)', lineHeight: 1 }}>{p.priceLabel}</div>
                      <div style={{ fontSize: 12, color: 'var(--u-text-4)', marginTop: 5 }}>{p.gmvLimitLabel}</div>
                    </div>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 9 }}>
                      {[
                        { label: 'Todo lo de Premium Pro', ok: true },
                        { label: 'Productos y usuarios ilimitados', ok: true },
                        { label: 'Factura electrónica (FEL SAT)', ok: true },
                        { label: p.gmvLimitLabel, ok: true },
                      ].map(({ label, ok }) => (
                        <li key={label} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5 }}>
                          <span style={{ color: '#4ade80', flexShrink: 0 }}><Icon name="check" size={15} /></span>
                          <span style={{ color: 'var(--u-text-2)' }}>{label}</span>
                        </li>
                      ))}
                    </ul>
                    <a
                      href={waLink(`Hola, quiero información sobre el plan ${p.name} de Leogin`)}
                      target="_blank" rel="noopener noreferrer"
                      style={{
                        display: 'block', textAlign: 'center', textDecoration: 'none',
                        padding: '11px 0', borderRadius: 12, fontWeight: 700, fontSize: 14,
                        background: 'var(--surface-3)', color: 'var(--u-text)',
                      }}
                    >
                      Hablar con ventas
                    </a>
                  </div>
                );
              })}
            </div>
          </div>
        </details>
      </section>

      {/* Nota de uso justo */}
      <section style={{ maxWidth: 760, margin: '0 auto', padding: '0 18px 52px' }}>
        <Glass variant="quiet" style={{ borderRadius: 16, padding: '16px 20px' }}>
          <p style={{ fontSize: 13.5, color: 'var(--u-text-3)', lineHeight: 1.6, margin: 0 }}>
            <strong style={{ color: 'var(--u-text-2)' }}>Sobre el límite mensual:</strong>{' '}
            Todos los planes de pago incluyen un límite mensual de ventas digitales (GMV).
            Si tu restaurante supera el límite, te avisamos antes de cualquier ajuste —
            nunca habrá cobros sorpresa. El precio siempre es fijo hasta que acordemos juntos un cambio.
          </p>
        </Glass>
      </section>

      {/* Tabla de comparación completa */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '0 18px 64px' }}>
        <h2 className="t-display" style={{ fontSize: 22, marginBottom: 24 }}>Comparación completa</h2>
        <Glass variant="quiet" style={{ overflowX: 'auto', borderRadius: 18 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 700 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--u-hair)' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--u-text-4)', width: '30%' }}>Función</th>
                {[...PUBLIC_PLANS, 'VARIABLE' as PlanCode].map((code) => {
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
                {[...PUBLIC_PLANS, 'VARIABLE' as PlanCode].map((code) => {
                  const p = PLANS[code];
                  const accent = ACCENT_BY_PLAN[code];
                  return (
                    <td key={code} style={{ padding: '10px 8px', textAlign: 'center', fontFamily: 'var(--ui-font-mono)', fontWeight: 700, fontSize: 13, color: accent }}>
                      {p.priceLabel}
                    </td>
                  );
                })}
              </tr>
              <tr style={{ borderBottom: '1px solid var(--u-hair)' }}>
                <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--u-text-4)' }}>Límite GMV / mes</td>
                {[...PUBLIC_PLANS, 'VARIABLE' as PlanCode].map((code) => {
                  const p = PLANS[code];
                  return (
                    <td key={code} style={{ padding: '10px 8px', textAlign: 'center', fontSize: 12, color: 'var(--u-text-3)' }}>
                      {p.gmvLimit ? fmtQ(p.gmvLimit) : p.hasOrders ? 'Sin tope' : '—'}
                    </td>
                  );
                })}
              </tr>
              <tr style={{ borderBottom: '1px solid var(--u-hair)', background: 'rgba(255,255,255,0.02)' }}>
                <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--u-text-4)' }}>Productos en catálogo</td>
                {[...PUBLIC_PLANS, 'VARIABLE' as PlanCode].map((code) => {
                  const p = PLANS[code];
                  return (
                    <td key={code} style={{ padding: '10px 8px', textAlign: 'center', fontSize: 13, fontWeight: 600, color: 'var(--u-text-2)' }}>
                      {p.products === 'unlimited' ? '∞' : String(p.products)}
                    </td>
                  );
                })}
              </tr>
              <tr style={{ borderBottom: '1px solid var(--u-hair)' }}>
                <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--u-text-4)' }}>Usuarios del panel</td>
                {[...PUBLIC_PLANS, 'VARIABLE' as PlanCode].map((code) => {
                  const p = PLANS[code];
                  return (
                    <td key={code} style={{ padding: '10px 8px', textAlign: 'center', fontSize: 13, fontWeight: 600, color: 'var(--u-text-2)' }}>
                      {p.users === 'unlimited' ? '∞' : String(p.users)}
                    </td>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {FEATURE_ROWS.map(({ label, key }, i) => (
                <tr key={key} style={{ borderBottom: i < FEATURE_ROWS.length - 1 ? '1px solid var(--u-hair)' : 'none', background: i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
                  <td style={{ padding: '10px 16px', fontSize: 13, color: 'var(--u-text-3)' }}>{label}</td>
                  {[...PUBLIC_PLANS, 'VARIABLE' as PlanCode].map((code) => {
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

      {/* GMV Calculator */}
      <section id="calculadora" style={{ maxWidth: 780, margin: '0 auto', padding: '0 18px 72px' }}>
        <h2 className="t-display" style={{ fontSize: 22, marginBottom: 8 }}>¿Cuánto pagaría mi restaurante?</h2>
        <p className="t-mute" style={{ fontSize: 14, marginBottom: 28 }}>
          Arrastra el slider según tus ventas digitales mensuales y te mostramos el plan que te conviene.
        </p>
        <Glass variant="quiet" style={{ borderRadius: 20, padding: '28px 24px' }}>
          <GmvCalculator />
        </Glass>
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
            Empieza con 30 días gratis. Sin tarjeta, sin compromiso.
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
        <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: 'var(--u-text-4)', textDecoration: 'none' }}>Contacto</a>
      </footer>
    </div>
  );
}
