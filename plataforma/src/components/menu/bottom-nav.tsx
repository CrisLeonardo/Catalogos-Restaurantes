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
        /* `minWidth: 0` NO es cosmetico. Un elemento flex tiene `min-width: auto`,
           o sea que no puede encoger por debajo del ancho de su CONTENIDO: con
           cuatro pestañas (las de un menu con Fidelidad) y etiquetas de 12 px,
           esta barra pedia 460 px y no cabia en un telefono de 390. Al no caber,
           el documento se desbordaba y el movil se ALEJABA al 64 % para que
           cupiera: la carta entera se veia diminuta y descuadrada, "hecha para
           otras dimensiones". Medido en produccion: escala 0,641.
           Es el mismo arreglo que ya lleva la barra inferior del panel. */
        style={{
          pointerEvents: 'auto',
          width: '100%', maxWidth: 460, minWidth: 0,
          borderRadius: 'var(--m-r-xl)',
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
              /* `flex: 1 1 0` reparte el ancho a partes iguales y `minWidth: 0`
                 le permite encoger: sin los dos, la pestaña mas larga manda. */
              style={{ flex: '1 1 0', minWidth: 0, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            >
              <span
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                  width: '100%', minWidth: 0,
                  padding: '5px 4px', borderRadius: 'var(--m-r-md)',
                  background: isActive ? 'var(--u-text)' : 'transparent',
                  color: isActive ? 'var(--brand-bg)' : 'var(--u-text-3)',
                  transition: 'background 160ms, color 160ms',
                  userSelect: 'none',
                }}
              >
                <Icon name={tab.icon} size={18} />
                {/* 9,5px es demasiado pequeño para leerse de un vistazo con el
                   teléfono en la mano y el brazo estirado. */}
                {/* 9,5 px era demasiado pequeño para leerse de un vistazo con el
                   telefono en la mano. Con `maxWidth: 100%` y el recorte, una
                   etiqueta larga se acorta en vez de ensanchar la barra. */}
                <span
                  style={{
                    fontSize: 'var(--m-fs-xs)', fontWeight: 700, letterSpacing: '0.02em',
                    maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                >
                  {tab.label}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
