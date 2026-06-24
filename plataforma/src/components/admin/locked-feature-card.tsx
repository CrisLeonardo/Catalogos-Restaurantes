'use client';

import { useState } from 'react';
import { Icon } from '@/components/icons';

interface LockedFeature {
  icon: string;
  name: string;
  desc: string;
}

const LOCKED_FEATURES: LockedFeature[] = [
  { icon: 'list',      name: 'Pedidos online',       desc: 'Carrito y checkout para tus clientes' },
  { icon: 'whatsapp',  name: 'Aviso WhatsApp',        desc: 'Recibe cada pedido al instante' },
  { icon: 'thumbsUp',  name: 'Programa de lealtad',   desc: 'Puntos y recompensas para tus clientes' },
  { icon: 'ticket',    name: 'Cupones',                desc: 'Descuentos y promociones especiales' },
  { icon: 'bell',      name: 'Llamar al mesero',       desc: 'Tus clientes te llaman por QR' },
  { icon: 'calendar',  name: 'Reservaciones',          desc: 'Agenda mesas con anticipación' },
];

const CONTACT_WA = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_CONTACT_WHATSAPP : undefined;

export default function LockedFeatureSection({ restaurantName }: { restaurantName?: string }) {
  const [selected, setSelected] = useState<LockedFeature | null>(null);

  const waMsg = `Hola, quiero actualizar mi plan de Básico a Premium para ${restaurantName ?? 'mi restaurante'}`;
  const ctaHref = CONTACT_WA
    ? `https://wa.me/${CONTACT_WA}?text=${encodeURIComponent(waMsg)}`
    : `mailto:${process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? 'crisleonardo100@gmail.com'}?subject=${encodeURIComponent('Actualizar a Premium')}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div className="t-kicker" style={{ fontSize: 10, marginBottom: 6 }}>Desbloquea más con Premium</div>
        <p style={{ fontSize: 13, color: 'var(--u-text-3)', margin: 0 }}>
          Actualiza a Premium (Q600/mes) para activar pedidos online y mucho más.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
        {LOCKED_FEATURES.map((feat) => (
          <button
            key={feat.name}
            type="button"
            onClick={() => setSelected(feat)}
            className="glass press"
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
              gap: 8, padding: '14px 14px', borderRadius: 14, textAlign: 'left',
              cursor: 'pointer', border: 'none', background: 'transparent',
              position: 'relative', color: 'inherit',
            }}
          >
            <div style={{ position: 'relative', display: 'inline-flex' }}>
              <Icon name={feat.icon} size={20} style={{ color: 'var(--u-text-3)' }} />
              <Icon name="key" size={11} style={{
                position: 'absolute', bottom: -3, right: -5,
                color: 'var(--u-text-4)',
              }} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--u-text-2)' }}>{feat.name}</div>
              <div style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: 2, lineHeight: 1.35 }}>{feat.desc}</div>
            </div>
            <div style={{
              position: 'absolute', inset: 0, borderRadius: 14, display: 'flex', alignItems: 'center',
              justifyContent: 'center', opacity: 0, transition: 'opacity 0.15s',
              background: 'rgba(var(--brand-accent-rgb, 99,102,241), 0.08)',
            }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.opacity = '1'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.opacity = '0'; }}
            >
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand-accent)', background: 'var(--surface-1)', padding: '4px 10px', borderRadius: 99 }}>
                Disponible en Premium
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Modal */}
      {selected && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9000,
            background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', padding: 20,
          }}
          onClick={() => setSelected(null)}
        >
          <div
            className="glass-solid"
            style={{ borderRadius: 20, padding: '28px 24px', maxWidth: 420, width: '100%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-display)' }}>{selected.name}</div>
                <div style={{ fontSize: 13, color: 'var(--u-text-3)', marginTop: 4 }}>{selected.desc}</div>
              </div>
              <button type="button" onClick={() => setSelected(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--u-text-3)', padding: 4 }}>
                <Icon name="x" size={20} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, marginBottom: 22 }}>
              <div style={{ padding: '10px 14px', borderRadius: '10px 0 0 10px', border: '1px solid var(--u-hair)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--u-text-4)', textTransform: 'uppercase', marginBottom: 6 }}>Básico</div>
                {['Menú digital QR', '30 productos', '1 usuario'].map((f) => (
                  <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--u-text-3)', marginBottom: 4 }}>
                    <Icon name="check" size={12} style={{ color: '#4ade80' }} />{f}
                  </div>
                ))}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--u-text-4)', marginBottom: 4 }}>
                  <Icon name="x" size={12} />{selected.name}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--u-text-3)', marginTop: 10 }}>Q299/mes</div>
              </div>
              <div style={{ padding: '10px 14px', borderRadius: '0 10px 10px 0', border: '2px solid var(--brand-accent)', marginLeft: -1 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--brand-accent)', textTransform: 'uppercase', marginBottom: 6 }}>Premium</div>
                {['Menú digital QR', 'Productos ilimitados', '3 usuarios', 'Pedidos en línea'].map((f) => (
                  <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--u-text-2)', marginBottom: 4 }}>
                    <Icon name="check" size={12} style={{ color: '#4ade80' }} />{f}
                  </div>
                ))}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#4ade80', marginBottom: 4 }}>
                  <Icon name="check" size={12} />{selected.name}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand-accent)', marginTop: 10 }}>Q600/mes</div>
              </div>
            </div>

            <a
              href={ctaHref}
              target="_blank" rel="noopener noreferrer"
              style={{
                display: 'block', textAlign: 'center', textDecoration: 'none', padding: '12px 0',
                borderRadius: 12, fontWeight: 700, fontSize: 14,
                background: 'var(--brand-accent)', color: '#fff',
              }}
            >
              Actualizar a Premium — Q600/mes
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
