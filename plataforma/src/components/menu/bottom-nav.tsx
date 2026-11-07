'use client';

import CapsuleNavigation, { type CapsuleDestination } from '@/components/ui/capsule-navigation';

/** Alto de la navegación y su separación inferior, sin safe area. */
export const NAV_HEIGHT = 84;
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
  const menu = { key: 'menu', label: 'Menú', icon: 'home', onSelect: onSelectMenu };
  const pedidos = { key: 'pedidos', label: 'Pedidos', icon: 'receipt', onSelect: onSelectPedidos };
  const items: CapsuleDestination[] = [
    ...(ordersEnabled && !loyaltyOn ? [pedidos, menu] : [menu, ...(ordersEnabled ? [pedidos] : [])]),
    ...(loyaltyOn ? [{ key: 'fidelidad', label: 'Mis puntos', icon: 'star', onSelect: onSelectFidelidad }] : []),
    { key: 'cuenta', label: 'Cuenta', icon: 'user', onSelect: onSelectCuenta },
  ];

  return <CapsuleNavigation items={items} active={active} label="Navegación principal" />;
}
