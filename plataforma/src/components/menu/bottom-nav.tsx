'use client';

import { Icon } from '@/components/icons';
import styles from './bottom-nav.module.css';

/** Alto de la navegación y su separación inferior, sin safe area. */
export const NAV_HEIGHT = 76;
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
    { key: 'menu', label: 'Menú', icon: 'home', action: onSelectMenu },
    ...(ordersEnabled ? [{ key: 'pedidos' as NavTab, label: 'Pedidos', icon: 'receipt', action: onSelectPedidos }] : []),
    // «Mis puntos» y no «Fidelidad»: es la palabra que entiende el comensal (CAT-07).
    ...(loyaltyOn ? [{ key: 'fidelidad' as NavTab, label: 'Mis puntos', icon: 'star', action: onSelectFidelidad }] : []),
    { key: 'cuenta', label: 'Cuenta', icon: 'user', action: onSelectCuenta },
  ];

  return (
    <div className={styles.dock}>
      <nav className={styles.bar} aria-label="Navegación principal">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={styles.item}
            onClick={tab.action}
            aria-current={active === tab.key ? 'page' : undefined}
          >
            <span className={styles.mark}><Icon name={tab.icon} size={20} /></span>
            <span className={styles.label}>{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
