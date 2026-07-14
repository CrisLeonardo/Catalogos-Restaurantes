'use client';

import { useState } from 'react';
import { Icon } from '@/components/icons';
import { PLANS } from '@/lib/plans';

interface UpgradeFeature {
  icon: string;
  name: string;
  hook: string;
  impact: string;
  currentLabel: string;
  premiumLabel: string;
  excludeFor?: string[];
}

const ALL_UPGRADE_FEATURES: UpgradeFeature[] = [
  {
    icon: 'userPlus',
    name: 'Panel de mesero y mapa de mesas',
    hook: 'Toma pedidos desde cada mesa',
    impact: 'Tu equipo toma pedidos desde una tablet en la mesa y ves un mapa con el estado de cada una (libre, ocupada, por cobrar). No es un módulo que se compre aparte: es exclusivo de Premium.',
    currentLabel: 'Sin panel de mesero ni mapa de mesas',
    premiumLabel: 'Panel de mesero + mapa de mesas',
  },
  {
    icon: 'whatsapp',
    name: 'Aviso por WhatsApp',
    hook: 'Nunca pierdas un pedido nuevo',
    impact: 'Cada nuevo pedido llega a tu WhatsApp al instante. Los restaurantes que responden rápido completan más pedidos y reciben mejores reseñas.',
    currentLabel: 'Solo visible en el panel',
    premiumLabel: 'Alerta inmediata en WhatsApp',
    excludeFor: ['ESTANDAR'],
  },
  {
    icon: 'thumbsUp',
    name: 'Programa de lealtad',
    hook: 'Clientes que regresan solos',
    impact: 'Tus clientes acumulan puntos por cada compra y los canjean en su próxima visita. La lealtad convierte compradores únicos en clientes recurrentes sin gasto en publicidad.',
    currentLabel: 'Cada pedido es una sola vez',
    premiumLabel: 'Puntos que generan retorno',
  },
  {
    icon: 'ticket',
    name: 'Cupones y descuentos',
    hook: 'Convierte visitas en pedidos',
    impact: 'Crea códigos de descuento con límite de usos y fecha de vencimiento. Un cupón de bienvenida bien colocado convierte visitantes del menú en compradores activos.',
    currentLabel: 'Sin herramientas de conversión',
    premiumLabel: 'Cupones con control total',
  },
  {
    icon: 'calendar',
    name: 'Reservaciones',
    hook: 'Mesas llenas incluso entre semana',
    impact: 'Tus clientes reservan mesa desde el menú digital. Sabes con anticipación cuántos comensales llegan y puedes planificar tu cocina sin sorpresas.',
    currentLabel: 'Sin reservas en línea',
    premiumLabel: 'Agenda integrada en tu menú',
  },
  {
    icon: 'chart',
    name: 'Estadísticas avanzadas',
    hook: 'Decide con datos, no suposiciones',
    impact: 'Descubre cuáles platillos son más rentables, en qué horas vendes más y cuál es tu ticket promedio. Información real para tomar decisiones que impacten tu negocio.',
    currentLabel: 'Solo métricas básicas del día',
    premiumLabel: 'Análisis completo de ventas',
  },
  {
    icon: 'users',
    name: 'Usuarios ilimitados',
    hook: 'Tu equipo opera sin depender de ti',
    impact: 'Usuarios ilimitados con roles distintos: cajero, mesero y gerente pueden usar el panel con los accesos que cada uno necesita. Delegas sin perder control.',
    currentLabel: 'Solo 1 usuario administrador',
    premiumLabel: 'Usuarios ilimitados con roles',
  },
];

const CONTACT_WA = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_CONTACT_WHATSAPP : undefined;
const CONTACT_EMAIL = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? 'crisleonardo100@gmail.com' : 'crisleonardo100@gmail.com';

interface Props {
  restaurantName?: string;
  planActual?: string;
}

export default function LockedFeatureSection({ restaurantName, planActual = 'BASICO' }: Props) {
  const [selected, setSelected] = useState<UpgradeFeature | null>(null);

  const isEstandar = planActual === 'ESTANDAR';
  const currentPrice = `Q${isEstandar ? PLANS.ESTANDAR.priceMonthly : PLANS.BASICO.priceMonthly}`;
  const currentPlanLabel = isEstandar ? 'Estándar' : 'Básico';
  const fromPlanLabel = isEstandar ? 'de Estándar' : 'de Básico';

  const features = ALL_UPGRADE_FEATURES.filter(f => !f.excludeFor?.includes(planActual));

  const waMsg = `Hola, quiero actualizar mi plan ${fromPlanLabel} a Premium para ${restaurantName ?? 'mi restaurante'}`;
  const ctaHref = CONTACT_WA
    ? `https://wa.me/${CONTACT_WA}?text=${encodeURIComponent(waMsg)}`
    : `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Quiero actualizar a Premium')}`;

  const headerTitle = isEstandar
    ? 'Funciones disponibles en Premium'
    : `${features.length} herramientas que tu competencia ya usa`;

  const headerDesc = isEstandar
    ? 'Tu plan Estándar incluye pedidos para llevar. Con Premium desbloqueas delivery, comer en local y todo lo siguiente.'
    : `Están incluidas en Premium (${PLANS.PREMIUM.priceLabel}). Toca cualquiera para ver cómo impacta tu negocio.`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 13 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 12, flexShrink: 0,
          background: 'rgba(var(--brand-accent-rgb,99,102,241),0.13)',
          display: 'grid', placeItems: 'center', color: 'var(--brand-accent)',
        }}>
          <Icon name="sparkle" size={18} />
        </div>
        <div>
          <div style={{
            fontSize: 15, fontWeight: 800, fontFamily: 'var(--font-display)',
            color: 'var(--u-text)', lineHeight: 1.2, marginBottom: 3,
          }}>
            {headerTitle}
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--u-text-3)', margin: 0, lineHeight: 1.45 }}>
            {headerDesc}
          </p>
        </div>
      </div>

      {/* Feature grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: 9 }}>
        {features.map((feat) => (
          <button
            key={feat.name}
            type="button"
            onClick={() => setSelected(feat)}
            style={{
              display: 'flex', flexDirection: 'column', gap: 8,
              padding: '13px 12px', borderRadius: 14, textAlign: 'left',
              cursor: 'pointer', border: '1px solid rgba(var(--brand-accent-rgb,99,102,241),0.15)',
              background: 'rgba(var(--brand-accent-rgb,99,102,241),0.04)',
              color: 'inherit', position: 'relative', overflow: 'hidden',
              transition: 'border-color 0.15s, background 0.15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(var(--brand-accent-rgb,99,102,241),0.35)';
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(var(--brand-accent-rgb,99,102,241),0.08)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(var(--brand-accent-rgb,99,102,241),0.15)';
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(var(--brand-accent-rgb,99,102,241),0.04)';
            }}
          >
            {/* Premium chip */}
            <span style={{
              position: 'absolute', top: 8, right: 8,
              fontSize: 8.5, fontWeight: 800, padding: '2px 7px', borderRadius: 99,
              background: 'rgba(var(--brand-accent-rgb,99,102,241),0.15)',
              color: 'var(--brand-accent)', letterSpacing: '0.05em',
            }}>
              PREMIUM
            </span>

            <Icon name={feat.icon} size={20} style={{ color: 'var(--brand-accent)', opacity: 0.8 }} />

            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--u-text-2)', lineHeight: 1.2, paddingRight: 44 }}>
                {feat.name}
              </div>
              <div style={{ fontSize: 11, color: 'var(--u-text-4)', marginTop: 3, lineHeight: 1.35 }}>
                {feat.hook}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* CTA row */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', paddingTop: 2 }}>
        <a
          href={ctaHref}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '11px 20px', borderRadius: 'var(--radius-full)',
            fontWeight: 700, fontSize: 13.5, textDecoration: 'none',
            background: 'var(--brand-accent)', color: '#fff',
          }}
        >
          <Icon name="sparkle" size={14} />
          Actualizar a Premium — {PLANS.PREMIUM.priceLabel}
        </a>
        <a
          href="/admin/suscripcion"
          style={{
            fontSize: 13, color: 'var(--brand-accent)', textDecoration: 'none',
            fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5,
          }}
        >
          Ver comparativa <Icon name="arrowRight" size={13} />
        </a>
      </div>

      {/* Detail modal */}
      {selected && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9000,
            background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', padding: 20,
          }}
          onClick={() => setSelected(null)}
        >
          <div
            className="glass-solid anim-fade-up"
            style={{ borderRadius: 22, padding: '26px 22px', maxWidth: 430, width: '100%' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 13, flexShrink: 0,
                  background: 'rgba(var(--brand-accent-rgb,99,102,241),0.13)',
                  display: 'grid', placeItems: 'center', color: 'var(--brand-accent)',
                }}>
                  <Icon name={selected.icon} size={22} />
                </div>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--u-text)', lineHeight: 1.1 }}>
                    {selected.name}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--brand-accent)', fontWeight: 700, marginTop: 3 }}>
                    Incluido en Premium
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--u-text-3)', padding: 4, flexShrink: 0 }}
              >
                <Icon name="x" size={20} />
              </button>
            </div>

            {/* Impact text */}
            <p style={{ fontSize: 13.5, color: 'var(--u-text-3)', lineHeight: 1.65, marginBottom: 18 }}>
              {selected.impact}
            </p>

            {/* Current plan vs Premium comparison */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', marginBottom: 20 }}>
              <div style={{
                padding: '12px 14px',
                border: '1px solid var(--u-hair)', borderRadius: '12px 0 0 12px',
              }}>
                <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--u-text-4)', textTransform: 'uppercase', marginBottom: 8 }}>
                  Tu plan actual
                </div>
                <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start', fontSize: 12.5, color: 'var(--u-text-4)', lineHeight: 1.4 }}>
                  <Icon name="x" size={13} style={{ color: 'var(--u-text-4)', flexShrink: 0, marginTop: 1 }} />
                  <span>{selected.currentLabel}</span>
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20, color: 'var(--u-text-3)', marginTop: 12, lineHeight: 1 }}>
                  {currentPrice}
                </div>
                <div style={{ fontSize: 11, color: 'var(--u-text-4)', marginTop: 2 }}>/mes · {currentPlanLabel}</div>
              </div>
              <div style={{
                padding: '12px 14px', marginLeft: -1,
                border: '2px solid var(--brand-accent)', borderRadius: '0 12px 12px 0',
                background: 'rgba(var(--brand-accent-rgb,99,102,241),0.05)',
              }}>
                <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--brand-accent)', textTransform: 'uppercase', marginBottom: 8 }}>
                  Premium
                </div>
                <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start', fontSize: 12.5, color: 'var(--u-text-2)', lineHeight: 1.4 }}>
                  <Icon name="check" size={13} style={{ color: '#4ade80', flexShrink: 0, marginTop: 1 }} />
                  <span>{selected.premiumLabel}</span>
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20, color: 'var(--brand-accent)', marginTop: 12, lineHeight: 1 }}>
                  Q{PLANS.PREMIUM.priceMonthly}
                </div>
                <div style={{ fontSize: 11, color: 'var(--u-text-3)', marginTop: 2 }}>/mes · sin límite de ventas</div>
              </div>
            </div>

            {/* CTA */}
            <a
              href={ctaHref}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                textDecoration: 'none', padding: '13px 0', borderRadius: 14,
                fontWeight: 700, fontSize: 14, background: 'var(--brand-accent)', color: '#fff',
              }}
            >
              <Icon name="sparkle" size={14} />
              Actualizar a Premium
            </a>
            <p style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--u-text-4)', marginTop: 9, lineHeight: 1.4 }}>
              Sin compromiso · Tu menú sigue en vivo
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
