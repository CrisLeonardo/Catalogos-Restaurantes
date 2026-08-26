/**
 * La regla única del estado de una mesa.
 *
 * Antes cada pantalla decidía por su cuenta qué pintar: el mapa del salón
 * teñía de ámbar TODA mesa ocupada (y de rojo pasadas 2 h), el panel de
 * pedidos usaba los chips de estado del pedido, y el panel del dueño no
 * mostraba el salón. Tres criterios distintos para la misma pregunta.
 *
 * Aquí vive el único criterio, y las tres pantallas lo consumen:
 *
 *   libre     — no hay nada. Se dibuja callada: ni color ni texto.
 *   abierta   — hay gente comiendo. Tinta normal + una línea de qué pasa.
 *   atencion  — alguien te necesita AHORA. Es lo único que lleva acento.
 *
 * El principio: el color no describe, avisa. Cinco mesas ocupadas no son
 * cinco alarmas; una mesa que pidió la cuenta sí lo es.
 */
import type { OrderStatus } from '@/types';
import type { TableOccupancy, TableCall } from '@/lib/db/orders';

export type TableStateKind = 'libre' | 'abierta' | 'atencion';

/** Por qué una mesa pide atención. El orden del tipo NO importa; el que
    manda es PRIORIDAD, más abajo. */
export type TableReason =
  | 'cuenta'        // el comensal pidió la cuenta desde el menú
  | 'llamada'       // el comensal llamó al mesero
  | 'lista'         // hay comida lista sin que nadie la lleve
  | 'sin-cobrar'    // la mesa ya comió y nadie la cerró
  | 'sin-aceptar'   // el pedido lleva rato sin que cocina lo acepte
  | 'abandonada';   // lleva más de un día abierta

export interface TableState {
  kind: TableStateKind;
  /** Solo en `atencion`. */
  reason: TableReason | null;
  /** Texto corto para la ficha de mesa: "Pidió la cuenta", "2 platos · 18 min". */
  label: string;
  /** Desde cuándo cuenta el reloj que hace relevante este estado. */
  since: string | null;
  /** Ordena la lista "te necesitan ahora": menor = más urgente. */
  priority: number;
}

/* ── Umbrales ──────────────────────────────────────────────────────
   Los de cocina son configurables por restaurante y viven en el panel;
   estos son los del SALÓN, que no dependen de qué se cocine:

   · un plato listo se lleva a la mesa en pocos minutos o se enfría;
   · una mesa que ya comió se cobra dentro del rato o se olvida;
   · un pedido sin aceptar es cocina que no vio la comanda.               */
export const READY_ALERT_MIN = 8;
export const UNPAID_ALERT_MIN = 15;
export const UNACCEPTED_ALERT_MIN = 5;
/** Más de esto abierta y no es una mesa: es un pedido olvidado. */
export const ABANDONED_HOURS = 24;

const PRIORITY: Record<TableReason, number> = {
  cuenta: 0,
  lista: 1,
  llamada: 2,
  'sin-aceptar': 3,
  'sin-cobrar': 4,
  abandonada: 5,
};

const LIBRE: TableState = { kind: 'libre', reason: null, label: 'Libre', since: null, priority: 99 };

function minutosDesde(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return (now - t) / 60000;
}

/** "18 min", "2 h 10 min". Igual que el temporizador del mapa del salón. */
export function fmtMin(min: number): string {
  const m = Math.max(0, Math.floor(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
}

const STATUS_LABEL: Partial<Record<OrderStatus, string>> = {
  NEW: 'Sin aceptar',
  PREP: 'En cocina',
  READY: 'Lista',
  SERVED: 'Servida',
};

/**
 * El estado de UNA mesa.
 *
 * `now` se pasa desde fuera (y no se lee aquí) para que servidor y cliente
 * pinten lo mismo: si cada uno llamara a Date.now() el primer render del
 * cliente no coincidiría con el HTML del servidor y React se quejaría.
 * Pásalo `null` mientras no haya reloj y se devuelve el estado sin relojes.
 */
export function tableState(
  occ: TableOccupancy | undefined,
  call: TableCall | undefined,
  now: number | null,
): TableState {
  if (!occ) return LIBRE;

  const abierta = (label: string): TableState => ({
    kind: 'abierta', reason: null, label, since: occ.since, priority: 50,
  });
  const atencion = (reason: TableReason, label: string, since: string | null): TableState => ({
    kind: 'atencion', reason, label, since, priority: PRIORITY[reason],
  });

  const platos = occ.itemCount === 1 ? '1 plato' : `${occ.itemCount} platos`;

  // Sin reloj todavía (primer render del servidor): se muestra lo que no
  // depende del tiempo. La llamada del comensal sí, porque es un hecho.
  if (now == null) {
    if (call?.reason === 'bill') return atencion('cuenta', 'Pidió la cuenta', call.since);
    if (call) return atencion('llamada', 'Te llamaron', call.since);
    return abierta(platos);
  }

  const abiertaMin = minutosDesde(occ.since, now) ?? 0;

  // 1. Lo que el comensal pidió explícitamente manda sobre cualquier reloj.
  if (call?.reason === 'bill') {
    const m = minutosDesde(call.since, now);
    return atencion('cuenta', m == null ? 'Pidió la cuenta' : `Pidió la cuenta · ${fmtMin(m)}`, call.since);
  }
  if (call) {
    const m = minutosDesde(call.since, now);
    return atencion('llamada', m == null ? 'Te llamaron' : `Te llamaron · ${fmtMin(m)}`, call.since);
  }

  // 2. Mesa abandonada. Va ANTES que los relojes de servicio a propósito: un
  //    pedido de ayer sin cerrar no es "lista hace 24 h" ni "sin aceptar hace
  //    24 h" — eso confunde al mesero mandándolo a una mesa que no existe. Es
  //    basura que hay que archivar, y así se llama. (Lo pide menos que lo
  //    demás; de eso se encarga PRIORITY, no el orden de estas comprobaciones.)
  if (abiertaMin >= ABANDONED_HOURS * 60) {
    return atencion('abandonada', `Abierta hace ${fmtMin(abiertaMin)}`, occ.since);
  }

  // 3. Comida lista que nadie ha llevado: se enfría mientras tanto.
  const readyMin = minutosDesde(occ.readySince, now);
  if (occ.status === 'READY' && readyMin != null && readyMin >= READY_ALERT_MIN) {
    return atencion('lista', `Lista hace ${fmtMin(readyMin)}`, occ.readySince);
  }

  // 4. Cocina que no ha visto la comanda.
  if (occ.status === 'NEW' && abiertaMin >= UNACCEPTED_ALERT_MIN) {
    return atencion('sin-aceptar', `Sin aceptar hace ${fmtMin(abiertaMin)}`, occ.since);
  }

  // 5. Ya comieron y nadie cobró.
  const servedMin = minutosDesde(occ.servedAt, now);
  if (occ.status === 'SERVED' && servedMin != null && servedMin >= UNPAID_ALERT_MIN) {
    return atencion('sin-cobrar', `Servida hace ${fmtMin(servedMin)}`, occ.servedAt);
  }

  // 6. Nada urgente: la mesa cuenta qué está pasando, sin color.
  const estado = STATUS_LABEL[occ.status];
  const tiempo = fmtMin(abiertaMin);
  if (occ.status === 'SERVED') return abierta(`Servida · ${tiempo}`);
  if (estado && occ.status !== 'PREP') return abierta(`${estado} · ${tiempo}`);
  return abierta(`${platos} · ${tiempo}`);
}

/** Todas las mesas del salón, ya resueltas y ordenadas por urgencia. */
export interface TableWithState {
  n: number;
  state: TableState;
  occ: TableOccupancy | undefined;
}

export function tablesWithState(
  tableCount: number,
  occupancy: Record<number, TableOccupancy>,
  calls: Record<number, TableCall>,
  now: number | null,
): TableWithState[] {
  const out: TableWithState[] = [];
  for (let n = 1; n <= tableCount; n++) {
    out.push({ n, state: tableState(occupancy[n], calls[n], now), occ: occupancy[n] });
  }
  return out;
}

/** Las que piden acción, de la más urgente a la menos. */
export function needsAttention(tables: TableWithState[]): TableWithState[] {
  return tables
    .filter((t) => t.state.kind === 'atencion')
    .sort((a, b) => a.state.priority - b.state.priority
      || (a.state.since ?? '').localeCompare(b.state.since ?? ''));
}
