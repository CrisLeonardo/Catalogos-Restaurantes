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

/**
 * Cuánto grita una mesa que pide algo.
 *
 * Con un solo nivel, seis de ocho mesas abiertas salían en acento en un
 * salón normal —una recién tomada, una en cocina, una lista, dos servidas,
 * dos llamadas—: los relojes son cortos y en hora pico casi toda mesa cruza
 * alguno. Cuando el acento lo lleva todo, el acento no avisa de nada.
 *
 *   alarma — alguien está esperando AHORA. Lo que una persona pidió
 *            explícitamente (llamó, pidió la cuenta) y lo que se pasó del
 *            DOBLE de su umbral. Esto, y solo esto, lleva color.
 *   aviso  — un reloj cruzó su umbral. Se dice con tinta y texto, sin fondo
 *            ni borde de color: está pendiente, no es una emergencia.
 */
export type TableLevel = 'alarma' | 'aviso';

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
  /** Solo en `atencion`: si esto lleva acento o se dice en voz baja. */
  level: TableLevel | null;
  /** La línea completa, para la lista "Te necesitan ahora" y el teléfono:
      "Pidió la cuenta · 3 min", "Lista hace 12 min". */
  label: string;
  /** Lo mismo en dos o tres palabras, para la ficha de mesa. Una ficha mide
      unos 95 px: ahí no cabe "Servida hace 21 minutos" y recortarlo con
      puntos suspensivos no dice nada. Vive aquí, y no en el componente, para
      que las tres pantallas abrevien igual. */
  short: string;
  /** Desde cuándo cuenta el reloj que hace relevante este estado. */
  since: string | null;
  /** Ordena la lista "te necesitan ahora": menor = más urgente. */
  priority: number;
}

/* ── Umbrales ──────────────────────────────────────────────────────
   Los del SALÓN, que no dependen de qué se cocine:

   · un plato listo se lleva a la mesa en pocos minutos o se enfría;
   · una mesa que ya comió se cobra dentro del rato o se olvida;
   · un pedido sin aceptar es cocina que no vio la comanda.

   Estos son los de fábrica. Un restaurante de menú del día y uno de
   sobremesa larga no tienen el mismo "dentro del rato", así que —igual
   que el semáforo de cocina— cada uno pone los suyos en Ajustes ›
   Pedidos y llegan hasta aquí por `SalonUmbrales`.                     */
export const READY_ALERT_MIN = 8;
export const UNPAID_ALERT_MIN = 15;
export const UNACCEPTED_ALERT_MIN = 5;
/** Más de esto abierta y no es una mesa: es un pedido olvidado. */
export const ABANDONED_HOURS = 24;

export interface SalonUmbrales {
  /** Minutos con la comida lista sin que nadie la lleve. */
  readyMin: number;
  /** Minutos servida sin que nadie cobre. */
  unpaidMin: number;
  /** Minutos con la comanda sin que cocina la acepte. */
  unacceptedMin: number;
}

export const UMBRALES_SALON: SalonUmbrales = {
  readyMin: READY_ALERT_MIN,
  unpaidMin: UNPAID_ALERT_MIN,
  unacceptedMin: UNACCEPTED_ALERT_MIN,
};

/** Pasado el doble del umbral, el pendiente deja de esperar y grita. */
export const ALARMA_FACTOR = 2;

const PRIORITY: Record<TableReason, number> = {
  cuenta: 0,
  lista: 1,
  llamada: 2,
  'sin-aceptar': 3,
  'sin-cobrar': 4,
  abandonada: 5,
};

/** La abreviatura de cada motivo. "Cuenta" y "Lista" son las que el mesero
    ya dice en voz alta; las demás se quedan como están porque acortarlas más
    las volvería adivinanzas. */
const SHORT: Record<TableReason, string> = {
  cuenta: 'Cuenta',
  lista: 'Lista',
  llamada: 'Te llaman',
  'sin-aceptar': 'Sin aceptar',
  'sin-cobrar': 'Sin cobrar',
  abandonada: 'Abandonada',
};

const LIBRE: TableState = {
  kind: 'libre', reason: null, level: null, label: 'Libre', short: 'Libre', since: null, priority: 99,
};

/* ── Cómo se DIBUJA una mesa ───────────────────────────────────
   El estado responde «¿hay que hacer algo?»; el tono responde «¿de
   qué color sale?». Son la misma pregunta hasta que `atencion` se
   parte en dos niveles, y desde entonces ya no: una mesa servida
   hace 16 minutos necesita algo, pero no necesita gritar.

   Es lo que consumen la ficha, la fila, el pin y la leyenda, para
   que las tres pantallas no puedan volver a inventarse los colores
   por su cuenta —que es de lo que se venía: el plano del dueño
   decía «Te necesita · Comiendo · Libre» y el panel del mesero
   «Libre · Abierta · Necesita atención», mismo dato y tres
   palabras distintas.                                          */
export type TableTone = 'alarma' | 'aviso' | 'abierta' | 'libre';

export function tableTone(s: TableState): TableTone {
  if (s.kind === 'libre') return 'libre';
  if (s.kind === 'abierta') return 'abierta';
  return s.level === 'aviso' ? 'aviso' : 'alarma';
}

/** Los verbos que se dicen en voz alta en un turno. */
export const TONE_LABEL: Record<TableTone, string> = {
  alarma: 'Te necesita ya',
  aviso: 'Pendiente',
  abierta: 'Comiendo',
  libre: 'Libre',
};

/** El orden de la leyenda: de lo que grita a lo que no dice nada.
    Es el mismo orden en que se mira un salón lleno. */
export const TONE_ORDER: TableTone[] = ['alarma', 'aviso', 'abierta', 'libre'];

function minutosDesde(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return (now - t) / 60000;
}

/**
 * Lo mismo en el ancho de una ficha de mesa: "18 min", "2 h", "1 d".
 *
 * A partir de la hora se tiran los minutos a propósito. En la lista "Te
 * necesitan ahora" hay sitio para "Lista hace 3 h 40 min", pero en una ficha
 * de 108 px eso son dos renglones — y con `grid-auto-rows: 1fr` un renglón
 * de más en UNA ficha engorda las cuarenta. Además el minuto exacto no
 * cambia nada: pasada la hora, lo que el mesero hace es lo mismo.
 */
export function fmtMinShort(min: number): string {
  const m = Math.max(0, Math.floor(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  return `${d} d`;
}

/** "18 min", "2 h 10 min". Igual que el temporizador del mapa del salón. */
export function fmtMin(min: number): string {
  const m = Math.max(0, Math.floor(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
}

/** La llamada, si de verdad es de esta mesa; `undefined` si es de la
    tanda anterior (se pidió antes de que esta se abriera). */
function call1(call: TableCall | undefined, since: string): TableCall | undefined {
  if (!call) return undefined;
  const c = new Date(call.since).getTime();
  const s = new Date(since).getTime();
  if (!Number.isFinite(c) || !Number.isFinite(s)) return call;
  return c >= s ? call : undefined;
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
  callRaw: TableCall | undefined,
  now: number | null,
  umbrales: SalonUmbrales = UMBRALES_SALON,
): TableState {
  if (!occ) return LIBRE;

  /* Una llamada ANTERIOR a que se abriera la mesa es de la gente que se
     sentó antes: se fueron, la mesa se liberó y nadie resolvió el aviso.
     Sin esta comprobación, un "pidió la cuenta" olvidado de la semana
     pasada secuestra una mesa que acaba de sentarse — visto tal cual en
     el entorno local: «Pidió la cuenta · 145 h 53 min» en una mesa de
     diecisiete minutos. El aviso muere con la mesa que lo pidió. */
  const call = call1(callRaw, occ.since);

  const abierta = (label: string, short = label): TableState => ({
    kind: 'abierta', reason: null, level: null, label, short, since: occ.since, priority: 50,
  });
  /** `level` va explícito en cada llamada: es la decisión de si esto grita. */
  const atencion = (
    reason: TableReason, level: TableLevel, label: string, since: string | null, short = SHORT[reason],
  ): TableState => ({
    kind: 'atencion', reason, level, label, short, since, priority: PRIORITY[reason],
  });
  /** Un reloj de servicio: pendiente al cruzar su umbral, alarma al doble. */
  const porReloj = (min: number, umbral: number): TableLevel => (
    min >= umbral * ALARMA_FACTOR ? 'alarma' : 'aviso'
  );

  const platos = occ.itemCount === 1 ? '1 plato' : `${occ.itemCount} platos`;

  // Sin reloj todavía (primer render del servidor): se muestra lo que no
  // depende del tiempo. La llamada del comensal sí, porque es un hecho.
  if (now == null) {
    if (call?.reason === 'bill') return atencion('cuenta', 'alarma', 'Pidió la cuenta', call.since);
    if (call) return atencion('llamada', 'alarma', 'Te llamaron', call.since);
    return abierta(platos);
  }

  const abiertaMin = minutosDesde(occ.since, now) ?? 0;

  // 1. Lo que el comensal pidió explícitamente manda sobre cualquier reloj, y
  //    es alarma desde el primer segundo: no hay umbral que discutir cuando
  //    alguien levantó la mano.
  if (call?.reason === 'bill') {
    const m = minutosDesde(call.since, now);
    return atencion('cuenta', 'alarma', m == null ? 'Pidió la cuenta' : `Pidió la cuenta · ${fmtMin(m)}`, call.since);
  }
  if (call) {
    const m = minutosDesde(call.since, now);
    return atencion('llamada', 'alarma', m == null ? 'Te llamaron' : `Te llamaron · ${fmtMin(m)}`, call.since);
  }

  // 2. Mesa abandonada. Va ANTES que los relojes de servicio a propósito: un
  //    pedido de ayer sin cerrar no es "lista hace 24 h" ni "sin aceptar hace
  //    24 h" — eso confunde al mesero mandándolo a una mesa que no existe. Es
  //    basura que hay que archivar, y así se llama. (Lo pide menos que lo
  //    demás; de eso se encarga PRIORITY, no el orden de estas comprobaciones.)
  //    Nunca es alarma: lleva un día ahí, un minuto más no cambia nada.
  if (abiertaMin >= ABANDONED_HOURS * 60) {
    return atencion('abandonada', 'aviso', `Abierta hace ${fmtMin(abiertaMin)}`, occ.since);
  }

  // 3. Comida lista que nadie ha llevado: se enfría mientras tanto.
  const readyMin = minutosDesde(occ.readySince, now);
  if (occ.status === 'READY' && readyMin != null && readyMin >= umbrales.readyMin) {
    // Aquí el reloj SÍ entra en la ficha: "Lista" a secas no distingue el
    // plato que acaba de salir del que lleva veinte minutos enfriándose.
    return atencion(
      'lista', porReloj(readyMin, umbrales.readyMin),
      `Lista hace ${fmtMin(readyMin)}`, occ.readySince, `Lista ${fmtMinShort(readyMin)}`,
    );
  }

  // 4. Cocina que no ha visto la comanda.
  if (occ.status === 'NEW' && abiertaMin >= umbrales.unacceptedMin) {
    return atencion(
      'sin-aceptar', porReloj(abiertaMin, umbrales.unacceptedMin),
      `Sin aceptar hace ${fmtMin(abiertaMin)}`, occ.since,
    );
  }

  // 5. Ya comieron y nadie cobró.
  const servedMin = minutosDesde(occ.servedAt, now);
  if (occ.status === 'SERVED' && servedMin != null && servedMin >= umbrales.unpaidMin) {
    return atencion(
      'sin-cobrar', porReloj(servedMin, umbrales.unpaidMin),
      `Servida hace ${fmtMin(servedMin)}`, occ.servedAt,
    );
  }

  // 6. Nada urgente: la mesa cuenta qué está pasando, sin color.
  const estado = STATUS_LABEL[occ.status];
  const tiempo = fmtMin(abiertaMin);
  const corto = fmtMinShort(abiertaMin);
  if (occ.status === 'SERVED') return abierta(`Servida · ${tiempo}`, `Servida ${corto}`);
  if (estado && occ.status !== 'PREP') return abierta(`${estado} · ${tiempo}`, corto);
  return abierta(`${platos} · ${tiempo}`, corto);
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
  umbrales: SalonUmbrales = UMBRALES_SALON,
): TableWithState[] {
  const out: TableWithState[] = [];
  for (let n = 1; n <= tableCount; n++) {
    out.push({ n, state: tableState(occupancy[n], calls[n], now, umbrales), occ: occupancy[n] });
  }
  return out;
}

/**
 * Lo urgente que es una mesa, como número.
 *
 * El motivo por sí solo no basta desde que hay dos niveles: «lista» pesa
 * menos que «llamada» en PRIORITY, pero una comida lista hace 4 minutos es
 * un pendiente y una llamada es una persona con la mano levantada. El nivel
 * manda sobre el motivo; el motivo desempata dentro del nivel.
 */
function urgencia(s: TableState): number {
  return (s.level === 'aviso' ? 100 : 0) + s.priority;
}

/** Las que piden acción, de la más urgente a la menos. */
export function needsAttention(tables: TableWithState[]): TableWithState[] {
  return tables
    .filter((t) => t.state.kind === 'atencion')
    .sort((a, b) => urgencia(a.state) - urgencia(b.state)
      || (a.state.since ?? '').localeCompare(b.state.since ?? ''));
}

/* ════════════════════════════════════════════════════════════
   LA ETAPA DE LA COMIDA
   ------------------------------------------------------------
   El estado dice si la mesa te necesita; la ETAPA dice en qué va la
   comida. Son preguntas distintas y la ficha enseña las dos: la
   barra de cuatro tramos (Pedido tomado → En cocina → Servida → Por
   cobrar) es lo que permite mirar el salón y saber, sin tocar nada,
   cuáles están esperando plato y cuáles esperando cuenta.

   Vive aquí, junto al estado, porque las tres pantallas que dibujan
   una mesa —fichas, plano y la pantalla de tomar pedidos— tienen que
   contar exactamente la misma historia.
   ════════════════════════════════════════════════════════════ */

/** Las cuatro etapas, en orden. El índice ES el paso de la barra. */
export const STAGES = ['Pedido tomado', 'En cocina', 'Servida', 'Por cobrar'] as const;
export type StageIndex = 0 | 1 | 2 | 3;

export interface TableStage {
  /** -1 = la mesa está libre: no hay ninguna etapa que enseñar. */
  index: StageIndex | -1;
  label: string;
  /** Desde cuándo dura ESTA etapa (no desde que se sentaron). */
  since: string | null;
}

const LIBRE_STAGE: TableStage = { index: -1, label: 'Sin abrir', since: null };

/**
 * En qué va la comida de una mesa.
 *
 * "Por cobrar" no es un estado del pedido sino una petición: la mesa ya
 * comió Y alguien está esperando la cuenta (la pidió, o lleva rato servida
 * sin que nadie la cierre). Por eso necesita el estado resuelto y no le
 * basta con `occ.status`.
 */
export function tableStage(occ: TableOccupancy | undefined, state: TableState): TableStage {
  if (!occ) return LIBRE_STAGE;

  const esperandoCuenta = state.reason === 'cuenta' || state.reason === 'sin-cobrar';

  if (occ.status === 'SERVED') {
    return esperandoCuenta
      ? { index: 3, label: STAGES[3], since: state.since ?? occ.servedAt ?? occ.since }
      : { index: 2, label: STAGES[2], since: occ.servedAt ?? occ.since };
  }
  if (occ.status === 'NEW') {
    return { index: 0, label: STAGES[0], since: occ.since };
  }
  // PREP · READY · TRANSIT — la comida está en marcha.
  return { index: 1, label: STAGES[1], since: occ.firedAt ?? occ.since };
}

/* ── La única acción de una ficha ──────────────────────────────
   "Una mesa = una acción": la ficha no ofrece un menú de opciones,
   ofrece lo que toca hacer AHORA. El verbo sale del motivo, no del
   estado del pedido, porque es el motivo el que dice qué está
   esperando alguien. */
export type TableActionKind = 'cobrar' | 'llevar' | 'atender' | 'agregar' | 'abrir' | 'revisar';

export interface TableAction {
  kind: TableActionKind;
  label: string;
}

const ACTION_BY_REASON: Record<TableReason, TableAction> = {
  cuenta: { kind: 'cobrar', label: 'Cobrar' },
  lista: { kind: 'llevar', label: 'Llevar a la mesa' },
  llamada: { kind: 'atender', label: 'Atender' },
  'sin-cobrar': { kind: 'cobrar', label: 'Cobrar' },
  'sin-aceptar': { kind: 'revisar', label: 'Ver la comanda' },
  abandonada: { kind: 'revisar', label: 'Revisar la mesa' },
};

export function tableAction(state: TableState): TableAction {
  if (state.kind === 'libre') return { kind: 'abrir', label: 'Abrir mesa' };
  if (state.kind === 'atencion' && state.reason) return ACTION_BY_REASON[state.reason];
  return { kind: 'agregar', label: 'Agregar platillos' };
}

/**
 * El salón ordenado como se trabaja en hora pico: primero lo que pide
 * algo (de lo más urgente a lo menos), luego lo que está en marcha, y al
 * final las libres.
 *
 * En hora pico nadie busca "la mesa 7": busca qué atender primero. Por eso
 * el orden por número solo manda DENTRO de cada grupo.
 */
export function byUrgency(tables: TableWithState[]): TableWithState[] {
  const rank = (t: TableWithState) => (t.state.kind === 'atencion' ? 0 : t.state.kind === 'abierta' ? 1 : 2);
  return [...tables].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    if (a.state.kind === 'atencion' && b.state.kind === 'atencion') {
      const p = urgencia(a.state) - urgencia(b.state);
      if (p !== 0) return p;
      // A igual motivo, la que lleva más tiempo esperando va primero.
      const s = (a.state.since ?? '').localeCompare(b.state.since ?? '');
      if (s !== 0) return s;
    }
    return a.n - b.n;
  });
}
