'use client';

import type { ReactNode } from 'react';
import { Icon } from '@/components/icons';
import styles from './bottom-nav.module.css';

/** Alto de la navegación y su separación inferior, sin safe area. */
export const NAV_HEIGHT = 76;
export type NavTab = 'menu' | 'pedidos' | 'fidelidad' | 'cuenta';

/** Lo que lleva el comensal, dicho en la misma barra (CV-14). */
export interface PedidoEnBarra {
  count: number;
  importe: string;
  /** «Ver pedido» (textos del tema). */
  label: string;
  /** Nombre accesible completo: «Ver pedido · 2 platillos · Q80.00». */
  ariaLabel: string;
  onOpen: () => void;
}

interface Props {
  active: NavTab;
  ordersEnabled: boolean;
  loyaltyOn: boolean;
  onSelectMenu: () => void;
  onSelectPedidos: () => void;
  onSelectFidelidad: () => void;
  onSelectCuenta: () => void;
  /** Con algo en el carrito: las secciones se encogen a iconos y aparece
      «Ver pedido · n · Q». */
  pedido?: PedidoEnBarra | null;
  /** «Mesero» como una sección más; solo existe con mesa escaneada. */
  mesero?: ReactNode;
}

/* UNA SOLA BARRA (auditoría «La carta que vende», CV-14)
   ------------------------------------------------------------
   Antes, con algo en el carrito, abajo se apilaban tres capas: «Llamar al
   mesero» flotando (y tapando media tarjeta), el resumen del carrito y la
   navegación — ≈200 px de 844, el 24 % de la pantalla. Ahora todo vive en
   esta barra: sin carrito, secciones con su nombre; con carrito, las
   secciones quedan en iconos y el pedido ocupa el centro. El mesero es una
   sección más. */
export default function BottomNav({ active, ordersEnabled, loyaltyOn, onSelectMenu, onSelectPedidos, onSelectFidelidad, onSelectCuenta, pedido = null, mesero = null }: Props) {
  const tabs: Array<{ key: NavTab; label: string; icon: string; action: () => void }> = [
    { key: 'menu', label: 'Menú', icon: 'home', action: onSelectMenu },
    ...(ordersEnabled ? [{ key: 'pedidos' as NavTab, label: 'Pedidos', icon: 'receipt', action: onSelectPedidos }] : []),
    // «Mis puntos» y no «Fidelidad»: es la palabra que entiende el comensal (CAT-07).
    ...(loyaltyOn ? [{ key: 'fidelidad' as NavTab, label: 'Mis puntos', icon: 'star', action: onSelectFidelidad }] : []),
    { key: 'cuenta', label: 'Cuenta', icon: 'user', action: onSelectCuenta },
  ];
  const lleva = !!pedido && pedido.count > 0;

  const boton = (tab: (typeof tabs)[number]) => (
    <button
      key={tab.key}
      type="button"
      className={styles.item}
      onClick={tab.action}
      aria-current={active === tab.key ? 'page' : undefined}
      aria-label={lleva ? tab.label : undefined}
    >
      <span className={styles.mark}><Icon name={tab.icon} size={20} /></span>
      <span className={styles.label}>{tab.label}</span>
    </button>
  );

  return (
    <div className={styles.dock}>
      <nav className={styles.bar} aria-label="Navegación principal" data-lleva={lleva ? '1' : undefined}>
        {boton(tabs[0])}
        {lleva && (
          // data-carrito-destino: aquí cae el platillo que vuela al agregar
          // (lib/volar-al-carrito.ts).
          <button
            type="button"
            data-carrito-destino=""
            className={`press ${styles.pedido}`}
            onClick={pedido!.onOpen}
            aria-label={pedido!.ariaLabel}
          >
            <span className={styles.pedidoCount}><Icon name="bag" size={15} />{pedido!.count}</span>
            <span className={styles.pedidoLabel}>{pedido!.label}</span>
            <span className={styles.pedidoTotal}>{pedido!.importe}</span>
          </button>
        )}
        {tabs.slice(1).map(boton)}
        {mesero}
      </nav>
    </div>
  );
}
