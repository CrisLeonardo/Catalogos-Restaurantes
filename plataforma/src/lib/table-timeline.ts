/**
 * "Cómo va la mesa" — la historia de una mesa en una lista de horas.
 *
 * Es la sección del lienzo (`diseno-pedidos-mesas/OpcionC.dc.html`) que se
 * quedó sin construir. Contesta la pregunta que un mesero hace en voz alta
 * veinte veces por turno y que hasta ahora solo sabía responder la memoria
 * de quien atendió: *¿esta mesa ya pidió el postre?, ¿cuánto lleva
 * esperando?, ¿quién le tomó la comanda?*
 *
 * No consulta nada nuevo. Las marcas de tiempo de estado (migración 020) y
 * `served_at` (071) ya viajan en cada pedido de la mesa; lo único que
 * faltaba era leerlas en orden.
 *
 * Vive aparte del componente, como `table-lines.ts`, porque es la parte que
 * no se puede comprobar mirando la pantalla: hay que probarla.
 */
import { remainingQuantity, type OrderWithItems } from '@/lib/db/orders';

export interface TimelineEvent {
  /** Momento del hecho, en ISO. Es lo que ordena la lista. */
  at: string;
  /** "Se abrió la mesa · 3 platos a cocina". */
  text: string;
  /** Quién lo hizo, si consta. Va en gris al canto derecho. */
  who: string | null;
  /** Marca el renglón en acento: lo que sigue esperando algo. */
  pendiente?: boolean;
}

/** Platos vivos de un pedido (los anulados no cuentan). */
function platosDe(o: OrderWithItems): number {
  let n = 0;
  for (const it of o.items ?? []) n += remainingQuantity(it, o.voids ?? []);
  return n;
}

function platos(n: number): string {
  return n === 1 ? '1 plato' : `${n} platos`;
}

/** "1 plato listo" / "3 platos listos": el participio concuerda o se lee mal. */
function platosCon(n: number, participio: string): string {
  return `${platos(n)} ${participio}${n === 1 ? '' : 's'}`;
}

/**
 * La historia de la mesa, de lo más viejo a lo más nuevo.
 *
 * Un detalle que importa: la PRIMERA comanda dice "se abrió la mesa" y las
 * siguientes dicen "N platos más". Para el mesero no son cuatro pedidos
 * iguales — uno sentó a la gente y los otros tres fueron añadiendo.
 */
export function tableTimeline(orders: OrderWithItems[]): TimelineEvent[] {
  const vivos = orders
    .filter((o) => o.status !== 'CANCEL')
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  const out: TimelineEvent[] = [];

  vivos.forEach((o, i) => {
    const n = platosDe(o);
    const quien = o.waiter_name ?? null;

    out.push({
      at: o.created_at,
      text: i === 0
        ? `Se abrió la mesa · ${platos(n)} a cocina`
        : `${platos(n)} más a cocina`,
      who: quien,
      // Una comanda que cocina no ha aceptado todavía es lo único de este
      // renglón que sigue pendiente de alguien.
      pendiente: o.status === 'NEW',
    });

    if (o.accepted_at) {
      out.push({ at: o.accepted_at, text: 'Cocina aceptó la comanda', who: null });
    }
    if (o.ready_at) {
      out.push({
        at: o.ready_at,
        text: o.served_at ? platosCon(n, 'listo') : `${platosCon(n, 'listo')} en la barra`,
        who: null,
        pendiente: !o.served_at,
      });
    }
    if (o.served_at) {
      out.push({ at: o.served_at, text: `${platosCon(n, 'servido')} en la mesa`, who: quien });
    }
  });

  /* Las anulaciones van con todo lo demás y no en una lista aparte: para
     quien mira la mesa, "se anuló la carne asada" es un hecho del turno
     exactamente igual que "se sirvió la sopa". */
  for (const o of orders) {
    for (const v of o.voids ?? []) {
      const nombre = v.item_id
        ? (o.items ?? []).find((it) => it.id === v.item_id)?.name_snapshot ?? 'un plato'
        : 'la comanda entera';
      const cuantos = v.item_id && v.quantity ? `${v.quantity} · ` : '';
      // Quién anuló, con el nombre guardado al anular: sigue saliendo aunque
      // esa persona ya no esté en el equipo (migración 135).
      out.push({ at: v.created_at, text: `Se anuló ${cuantos}${nombre} · ${v.reason}`, who: v.requested_by_name ?? null });
    }
  }

  return out.sort((a, b) => a.at.localeCompare(b.at));
}
