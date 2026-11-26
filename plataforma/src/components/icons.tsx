/* Iconos — Hugeicons (familia "Stroke Rounded", @hugeicons/core-free-icons).
   Antes eran SVGs derivados de Lucide a mano; ahora se renderizan con
   HugeiconsIcon, pero la firma pública `<Icon name="x" size={} />` no
   cambió: ningún call-site (~230 en el panel admin) necesitó tocarse.
   Sirve en server y cliente.

   La parte que usa la carta del comensal vive en icons-carta.tsx (para que
   un teléfono no baje los íconos del panel); aquí se le suman los demás. */

import { ICONOS_CARTA, pintarIcono, type IconProps } from '@/components/icons-carta';
import type { IconSvgElement } from '@hugeicons/react';
import {
  ArrowUp01Icon,
  ArrowUpRight01Icon,
  BanknoteIcon,
  BoxIcon,
  Calendar01Icon,
  CenterFocusIcon,
  ChartIcon,
  ComputerIcon,
  CreditCardIcon,
  DashboardSquare01Icon,
  FlaskConicalIcon,
  HelpCircleIcon,
  Key01Icon,
  KeyboardIcon,
  Layout01Icon,
  Mail01Icon,
  Mic01Icon,
  Moon02Icon,
  Notification03Icon,
  PencilEdit01Icon,
  PercentIcon,
  Plug01Icon,
  PrinterIcon,
  Settings01Icon,
  SmileIcon,
  SplitIcon,
  SquareLock01Icon,
  Sun01Icon,
  ThumbsUpIcon,
  Undo02Icon,
  UserAdd01Icon,
  UserGroupIcon,
  ViewIcon,
  ViewOffIcon,
  VolumeHighIcon,
} from '@hugeicons/core-free-icons';

export const ICON_PATHS: Record<string, IconSvgElement> = {
  ...ICONOS_CARTA,
  // nav / ui
  mic: Mic01Icon,
  keyboard: KeyboardIcon,
  layout: Layout01Icon,
  undo: Undo02Icon,
  split: SplitIcon,
  maximize: CenterFocusIcon,
  arrowUpRight: ArrowUpRight01Icon,
  arrowUp: ArrowUp01Icon,
  edit: PencilEdit01Icon,
  users: UserGroupIcon,
  calendar: Calendar01Icon,
  dashboard: DashboardSquare01Icon,
  chart: ChartIcon,
  settings: Settings01Icon,
  sun: Sun01Icon,
  moon: Moon02Icon,
  eye: ViewIcon,
  eyeOff: ViewOffIcon,
  volume: VolumeHighIcon,
  print: PrinterIcon,
  box: BoxIcon,
  percent: PercentIcon,
  userPlus: UserAdd01Icon,
  // food
  helpCircle: HelpCircleIcon,
  mail: Mail01Icon,
  creditCard: CreditCardIcon,
  banknote: BanknoteIcon,
  key: Key01Icon,
  lock: SquareLock01Icon,
  plug: Plug01Icon,
  flask: FlaskConicalIcon,
  thumbsUp: ThumbsUpIcon,
  smile: SmileIcon,
  bellRing: Notification03Icon,
  monitor: ComputerIcon,
};

export type IconName = keyof typeof ICON_PATHS;

export function Icon(props: IconProps) {
  return pintarIcono(ICON_PATHS, props);
}
