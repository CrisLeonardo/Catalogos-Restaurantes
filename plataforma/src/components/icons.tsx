/* Iconos — Hugeicons (familia "Stroke Rounded", @hugeicons/core-free-icons).
   Antes eran SVGs derivados de Lucide a mano; ahora se renderizan con
   HugeiconsIcon, pero la firma pública `<Icon name="x" size={} />` no
   cambió: ningún call-site (~230 en el panel admin) necesitó tocarse.
   Sirve en server y cliente. */

import type { CSSProperties } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import type { IconSvgElement } from '@hugeicons/react';
import {
  Home01Icon,
  Search01Icon,
  Mic01Icon,
  KeyboardIcon,
  Layout01Icon,
  Undo02Icon,
  SplitIcon,
  ShoppingBag01Icon,
  PlusSignIcon,
  MinusSignIcon,
  Cancel01Icon,
  Tick01Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  ArrowRight01Icon,
  ArrowUpRight01Icon,
  ArrowUp01Icon,
  ArrowDown01Icon,
  Delete01Icon,
  PencilEdit01Icon,
  MoreHorizontalIcon,
  Notification01Icon,
  UserIcon,
  UserGroupIcon,
  Logout01Icon,
  CheckmarkCircle01Icon,
  AlertCircleIcon,
  Clock01Icon,
  Calendar01Icon,
  MapPinIcon,
  Call02Icon,
  DeliveryTruck01Icon,
  DashboardSquare01Icon,
  ListViewIcon,
  GridViewIcon,
  Tag01Icon,
  GiftIcon,
  ChartIcon,
  Settings01Icon,
  Sun01Icon,
  Moon02Icon,
  ViewIcon,
  ViewOffIcon,
  Image01Icon,
  Upload01Icon,
  Download01Icon,
  VolumeHighIcon,
  PrinterIcon,
  WhatsappIcon,
  ReceiptTextIcon,
  Wallet01Icon,
  BoxIcon,
  PercentIcon,
  UserAdd01Icon,
  Coffee01Icon,
  DonutIcon,
  CroissantIcon,
  IceCream01Icon,
  CookieIcon,
  FireIcon,
  Leaf01Icon,
  StarIcon,
  SparklesIcon,
  MilkBottleIcon,
  WheatIcon,
  RestaurantIcon,
  HelpCircleIcon,
  Mail01Icon,
  CreditCardIcon,
  BanknoteIcon,
  Key01Icon,
  Plug01Icon,
  FlaskConicalIcon,
  ThumbsUpIcon,
  Ticket01Icon,
  SmileIcon,
  Notification03Icon,
  ComputerIcon,
  GlobalIcon,
} from '@hugeicons/core-free-icons';

export const ICON_PATHS: Record<string, IconSvgElement> = {
  // nav / ui
  home: Home01Icon,
  search: Search01Icon,
  mic: Mic01Icon,
  keyboard: KeyboardIcon,
  layout: Layout01Icon,
  undo: Undo02Icon,
  split: SplitIcon,
  bag: ShoppingBag01Icon,
  plus: PlusSignIcon,
  minus: MinusSignIcon,
  x: Cancel01Icon,
  check: Tick01Icon,
  chevronLeft: ChevronLeftIcon,
  chevronRight: ChevronRightIcon,
  chevronDown: ChevronDownIcon,
  arrowRight: ArrowRight01Icon,
  arrowUpRight: ArrowUpRight01Icon,
  arrowUp: ArrowUp01Icon,
  arrowDown: ArrowDown01Icon,
  trash: Delete01Icon,
  edit: PencilEdit01Icon,
  more: MoreHorizontalIcon,
  bell: Notification01Icon,
  user: UserIcon,
  users: UserGroupIcon,
  logOut: Logout01Icon,
  checkCircle: CheckmarkCircle01Icon,
  alertCircle: AlertCircleIcon,
  clock: Clock01Icon,
  calendar: Calendar01Icon,
  mapPin: MapPinIcon,
  phone: Call02Icon,
  truck: DeliveryTruck01Icon,
  dashboard: DashboardSquare01Icon,
  list: ListViewIcon,
  grid: GridViewIcon,
  tag: Tag01Icon,
  gift: GiftIcon,
  chart: ChartIcon,
  settings: Settings01Icon,
  sun: Sun01Icon,
  moon: Moon02Icon,
  eye: ViewIcon,
  eyeOff: ViewOffIcon,
  image: Image01Icon,
  upload: Upload01Icon,
  download: Download01Icon,
  volume: VolumeHighIcon,
  print: PrinterIcon,
  whatsapp: WhatsappIcon,
  receipt: ReceiptTextIcon,
  wallet: Wallet01Icon,
  box: BoxIcon,
  percent: PercentIcon,
  userPlus: UserAdd01Icon,
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
  helpCircle: HelpCircleIcon,
  mail: Mail01Icon,
  creditCard: CreditCardIcon,
  banknote: BanknoteIcon,
  key: Key01Icon,
  plug: Plug01Icon,
  flask: FlaskConicalIcon,
  thumbsUp: ThumbsUpIcon,
  ticket: Ticket01Icon,
  smile: SmileIcon,
  bellRing: Notification03Icon,
  monitor: ComputerIcon,
  globe: GlobalIcon,
};

export type IconName = keyof typeof ICON_PATHS;

interface IconProps {
  name: string;
  size?: number;
  strokeWidth?: number;
  style?: CSSProperties;
  className?: string;
}

export function Icon({ name, size = 18, strokeWidth = 2, style, className }: IconProps) {
  const icon = ICON_PATHS[name];
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
