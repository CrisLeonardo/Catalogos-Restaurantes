import type { OrderWithItems } from '@/lib/db/orders';
import { remainingQuantity } from '@/lib/db/orders';
import { DIETARY_TAG_MAP } from '@/lib/dietary-tags';
import type { OrderItem } from '@/types';

export const PASE = 'pase';
export const GENERAL = 'general';
export type Etapa = 'espera' | 'preparacion' | 'pase' | 'salida' | 'cancelada';
export type EstacionCocina = { id: string; name: string };

export function etapaDe(o: OrderWithItems): Etapa {
  if (o.status === 'CANCEL') return 'cancelada';
  if (o.cocina_salida_at) return 'salida';
  if (o.status === 'READY') return 'pase';
  return o.status === 'NEW' ? 'espera' : 'preparacion';
}

export function estacionDe(l: OrderItem): string {
  return l.cocina_estacion_id ?? GENERAL;
}

export function lineasVivas(o: OrderWithItems, estacion = PASE): OrderItem[] {
  return o.items.filter((l) => (estacion === PASE || estacionDe(l) === estacion) && remainingQuantity(l, o.voids) > 0);
}

export function ultimaAnulacion(o: OrderWithItems): string | null {
  const candidatas = [...o.voids.map((v) => v.created_at), o.cancelled_at].filter((v): v is string => !!v);
  return candidatas.sort().at(-1) ?? null;
}

export function opcionesDe(l: OrderItem): string {
  return (l.options_snapshot ?? []).map((o) => [o.group, o.choice, o.variant].filter(Boolean).join(' · ')).join(' / ');
}

export function alergenosDe(l: OrderItem): string[] {
  return (l.cocina_alergenos ?? []).filter((a) => DIETARY_TAG_MAP[a]?.kind === 'allergen').map((a) => DIETARY_TAG_MAP[a].label);
}

export function agruparPreparaciones(ordenes: OrderWithItems[], estacion: string) {
  const grupos = new Map<string, {
    plato: string; estacion: string; opciones: string; nota: string; alergias: string[]; cantidad: number; pedidos: Set<string>;
  }>();
  for (const o of ordenes) {
    if (etapaDe(o) !== 'preparacion') continue;
    for (const l of lineasVivas(o, estacion)) {
      if (l.cocina_preparada_at) continue;
      const alergias = alergenosDe(l).sort();
      const opciones = opcionesDe(l);
      const clave = JSON.stringify([estacionDe(l), l.product_id, l.name_snapshot, l.options_snapshot ?? [], l.note, alergias, o.notes]);
      const existente = grupos.get(clave);
      if (existente) {
        existente.cantidad += remainingQuantity(l, o.voids);
        existente.pedidos.add(o.order_number);
      } else {
        grupos.set(clave, {
          plato: l.name_snapshot, estacion: estacionDe(l), opciones, alergias,
          nota: [l.note, o.notes].filter(Boolean).join(' · '),
          cantidad: remainingQuantity(l, o.voids), pedidos: new Set([o.order_number]),
        });
      }
    }
  }
  return [...grupos.values()];
}
