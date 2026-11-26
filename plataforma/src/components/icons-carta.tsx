/* Íconos de la carta del comensal — Hugeicons («Stroke Rounded»).
   ------------------------------------------------------------
   Los íconos se piden por nombre (`<Icon name="plus" />`), así que la
   tabla viaja entera al navegador de quien la importe. La del panel tiene
   83 y la carta usa 48: con la tabla completa, cada teléfono que escanea
   un QR bajaba los otros 35 sin usarlos (auditoría de lanzamiento
   2026-11-23, LZ-12). Esta es la parte de la carta; icons.tsx la amplía
   para el panel con la misma firma.

   Si un archivo de la carta necesita un ícono que no está aquí, agrégalo
   a esta tabla (no importes icons.tsx desde la carta): iconos-carta.test.ts
   lo vigila. Incluye todos los que se pueden elegir para una categoría o
   un platillo (category-icon.ts y el formulario de producto). */

import type { CSSProperties } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import type { IconSvgElement } from '@hugeicons/react';
import {
  AlertCircleIcon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  Call02Icon,
  Cancel01Icon,
  CheckmarkCircle01Icon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Clock01Icon,
  Coffee01Icon,
  CookieIcon,
  CroissantIcon,
  Delete01Icon,
  DeliveryTruck01Icon,
  DonutIcon,
  Download01Icon,
  FireIcon,
  GiftIcon,
  GlobalIcon,
  GridViewIcon,
  Home01Icon,
  IceCream01Icon,
  Image01Icon,
  Leaf01Icon,
  ListViewIcon,
  MilkBottleIcon,
  MinusSignIcon,
  MoreHorizontalIcon,
  Notification01Icon,
  PlusSignIcon,
  ReceiptTextIcon,
  RestaurantIcon,
  RotateClockwiseIcon,
  Search01Icon,
  ShoppingBag01Icon,
  SparklesIcon,
  StarIcon,
  Tag01Icon,
  Tick01Icon,
  Ticket01Icon,
  Upload01Icon,
  UserIcon,
  Wallet01Icon,
  WheatIcon,
  Logout01Icon,
  MapPinIcon,
  WhatsappIcon,
} from '@hugeicons/core-free-icons';

export const ICONOS_CARTA: Record<string, IconSvgElement> = {
  // nav / ui
  home: Home01Icon,
  search: Search01Icon,
  rotate: RotateClockwiseIcon,
  bag: ShoppingBag01Icon,
  plus: PlusSignIcon,
  minus: MinusSignIcon,
  x: Cancel01Icon,
  check: Tick01Icon,
  chevronLeft: ChevronLeftIcon,
  chevronRight: ChevronRightIcon,
  chevronDown: ChevronDownIcon,
  arrowRight: ArrowRight01Icon,
  arrowDown: ArrowDown01Icon,
  trash: Delete01Icon,
  more: MoreHorizontalIcon,
  bell: Notification01Icon,
  user: UserIcon,
  checkCircle: CheckmarkCircle01Icon,
  alertCircle: AlertCircleIcon,
  clock: Clock01Icon,
  phone: Call02Icon,
  truck: DeliveryTruck01Icon,
  list: ListViewIcon,
  grid: GridViewIcon,
  tag: Tag01Icon,
  gift: GiftIcon,
  image: Image01Icon,
  upload: Upload01Icon,
  download: Download01Icon,
  receipt: ReceiptTextIcon,
  wallet: Wallet01Icon,
  // food
  coffee: Coffee01Icon,
  bagel: DonutIcon,
  croissant: CroissantIcon,
  ice: IceCream01Icon,
  cookie: CookieIcon,
  flame: FireIcon,
  leaf: Leaf01Icon,
  star: StarIcon,
  sparkle: SparklesIcon,
  milk: MilkBottleIcon,
  wheat: WheatIcon,
  utensils: RestaurantIcon,
  ticket: Ticket01Icon,
  globe: GlobalIcon,
  logOut: Logout01Icon,
  mapPin: MapPinIcon,
  whatsapp: WhatsappIcon,
};

/** Alias para el código de la carta que valida un nombre guardado en la base. */
export const ICON_PATHS = ICONOS_CARTA;

export interface IconProps {
  name: string;
  size?: number;
  strokeWidth?: number;
  style?: CSSProperties;
  className?: string;
}

/** Pinta un ícono de la tabla dada; sin ese nombre, nada. */
export function pintarIcono(tabla: Record<string, IconSvgElement>, { name, size = 18, strokeWidth = 2, style, className }: IconProps) {
  const icon = tabla[name];
  if (!icon) return null;
  return (
    <HugeiconsIcon
      icon={icon}
      size={size}
      strokeWidth={strokeWidth}
      color="currentColor"
      style={{ flexShrink: 0, display: 'block', ...style }}
      className={className}
      aria-hidden
    />
  );
}

export function Icon(props: IconProps) {
  return pintarIcono(ICONOS_CARTA, props);
}
