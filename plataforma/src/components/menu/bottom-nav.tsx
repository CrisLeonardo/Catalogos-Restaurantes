'use client';

import { Icon } from '@/components/icons';

/** Espacio vertical total que ocupa la barra (sin safe-area-inset). */
export const NAV_HEIGHT = 68;

export type NavTab = 'menu' | 'pedidos' | 'fidelidad' | 'cuenta';

interface Props {
  active: NavTab;
  ordersEnabled: boolean;
  loyaltyOn: boolean;
  onSelectMenu: () => void;
  onSelectPedidos: () => void;
  onSelectFidelidad: () => void;
  onSelectCuenta: () => void;
}

export default function BottomNav({ active, ordersEnabled, loyaltyOn, onSelectMenu, onSelectPedidos, onSelectFidelidad, onSelectCuenta }: Props) {
  const tabs: Array<{ key: NavTab; label: string; icon: string; action: () => void }> = [
    { key: 'menu',      label: 'Menú',      icon: 'home',    action: onSelectMenu },
    ...(ordersEnabled ? [{ key: 'pedidos' as NavTab, label: 'Pedidos',   icon: 'receipt', action: onSelectPedidos }] : []),
    ...(loyaltyOn     ? [{ key: 'fidelidad' as NavTab, label: 'Fidelidad', icon: 'star',    action: onSelectFidelidad }] : []),
    { key: 'cuenta',    label: 'Cuenta',    icon: 'user',    action: onSelectCuenta },
  ];

  return (
    <nav
      aria-label="Navegación principal"
      style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 90,
        display: 'flex', justifyContent: 'center',
        padding: `8px 12px calc(12px + env(safe-area-inset-bottom, 0px))`,
        pointerEvents: 'none',
      }}
    >
      <div
        className="glass"
        style={{
          pointerEvents: 'auto',
          // Sigue al lienzo (--menu-max) para no quedar más estrecha que la
          // carta que tiene encima, con un tope propio: cuatro pestañas
          // repartidas a lo largo de 1.180 px dejan de leerse como una barra
          // y pasan a ser cuatro botones sueltos flotando.
          width: '100%', maxWidth: 'min(var(--menu-max, 460px), 560px)',
          borderRadius: 22,
          display: 'flex', alignItems: 'center', justifyContent: 'space-around',
          padding: '4px 6px',
          height: 48,
        }}
      >
        {tabs.map((tab) => {
          const isActive = active === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={tab.action}
              className="press"
              // La pestaña activa solo se distinguía por el color de fondo.
              // aria-current es lo que hace que una lectura asistida diga "Menú,
              // página actual" en vez de leer las cuatro pestañas igual y dejar
              // al comensal sin saber dónde está.
              aria-current={isActive ? 'page' : undefined}
              aria-label={isActive ? `${tab.label}, sección actual` : `Ir a ${tab.label}`}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            >
              <span
                style={{
                  display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                  padding: '5px 14px', borderRadius: 14,
                  background: isActive ? 'var(--u-text)' : 'transparent',
                  color: isActive ? 'var(--brand-bg)' : 'var(--u-text-3)',
                  transition: 'background 160ms, color 160ms',
                  userSelect: 'none', whiteSpace: 'nowrap',
                }}
              >
                <Icon name={tab.icon} size={18} />
                {/* 9,5px es demasiado pequeño para leerse de un vistazo con el
                   teléfono en la mano y el brazo estirado. */}
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.02em' }}>{tab.label}</span>
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
