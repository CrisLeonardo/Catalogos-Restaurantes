'use client';

/* Las piezas del salón: la ficha, la fila y el pin del plano.
   ------------------------------------------------------------------
   Las tres dibujan LA MISMA mesa con distinto nivel de detalle, así
   que viven juntas: si el criterio de color, el orden de los datos o
   la acción que se ofrece cambiaran en una sola de ellas, el salón
   contaría tres historias distintas del mismo local.

   Ninguna decide nada: reciben el estado ya resuelto por
   `lib/table-state.ts` y lo pintan. La regla sigue siendo la misma —
   el color no describe, avisa: solo la mesa que necesita a alguien
   lleva acento, y la libre se dibuja callada. */

import { Icon } from '@/components/icons';
import {
  byUrgency, fmtMin, tableAction, tableStage, tablesWithState, tableTone,
  METRICA_POR_PUESTO,
  type TableState, type TableStage, type TableAction, type SalonUmbrales,
  type SalonPuesto, type SalonMetrica,
} from '@/lib/table-state';
import type { TableCall, TableOccupancy } from '@/lib/db/orders';
import type { TableSeating } from '@/lib/db/table-sessions';
import type { FloorPlan } from '@/lib/theme/defaults';
import type { OrderStatus } from '@/types';

/** Lo que las tres piezas necesitan saber de una mesa. */
export interface SalonTable {
  n: number;
  state: TableState;
  stage: TableStage;
  occ: TableOccupancy | undefined;
  /** El turno abierto, si alguien la sentó (migración 128). Una mesa puede
      tener `seat` sin `occ`: sentados y sin pedir todavía. */
  seat: TableSeating | undefined;
  /** Tiene gente y su número se sale de las mesas configuradas (M-03). */
  fuera: boolean;
  /** Quién atiende: el mesero al que se le asignó la mesa y, si no hay,
      el que apuntó el primer plato. `null` = de nadie todavía. */
  waiterName: string | null;
  waiterId: string | null;
  /** Las iniciales del mesero y su color, para reconocer «mis mesas» de un
      vistazo en vez de leer veinte líneas de 12 px (M-05). `null` = de
      nadie todavía. */
  waiterMark: { iniciales: string; tono: string } | null;
  /** El número grande de la ficha: cuál es, su valor y cómo se llama
      (M-21). `cual` sirve para que el resto de la ficha NO lo repita:
      decir dos veces «8 h 10 min» en 168 px es exactamente el problema
      que este hallazgo venía a arreglar. */
  metrica: { cual: SalonMetrica; valor: string; etiqueta: string };
  action: TableAction;
  /** Ya formateado por quien pinta (símbolo y separadores del país). */
  total: string | null;
  /** Monto abreviado para el plano: «Q412», «Q1.2k». */
  totalCorto: string | null;
  /** «4 pers» — personas sentadas, o sillas de la mesa si está libre. */
  pax: string | null;
  /** Cómo la llaman en el local («Terraza 2»), si el plano le puso nombre.
      El número manda igual: esto solo se lee. */
  nombre: string | null;
  /** Cuánto lleva la etapa actual, ya en texto. */
  tiempo: string | null;
}

/* ════════════════════════════════════════════════════════════
   EL SALÓN, RESUELTO
   ------------------------------------------------------------
   De los datos crudos (ocupación, llamadas, plano) a las mesas que
   el lienzo pinta. Vive aquí, junto a las piezas, porque las DOS
   pantallas del salón lo necesitan igual: si una construyera sus
   mesas por su cuenta, volverían a contar historias distintas del
   mismo local — que es de lo que se venía.
   ════════════════════════════════════════════════════════════ */

export interface BuildSalonInput {
  tableCount: number;
  occupancy: Record<number, TableOccupancy>;
  calls: Record<number, TableCall>;
  /** El reloj del cliente. `null` mientras no hay: sin él no se pintan tiempos. */
  now: number | null;
  /** Sillas por mesa, para que una mesa libre pueda decir su capacidad. */
  floorPlan: FloorPlan | null;
  /** Importe completo («Q1,364.00»). */
  money: (n: number) => string;
  /** Importe abreviado para el pin del plano («Q412», «Q1.2k»). */
  moneyShort: (n: number) => string;
  /** Los relojes del salón de ESTE restaurante. Sin ellos, los de fábrica. */
  umbrales?: SalonUmbrales;
  /** Mesas sentadas sin pedido (migración 128). Sin esto, una mesa recién
      sentada es invisible hasta que alguien apunta el primer plato. */
  seatings?: Record<number, TableSeating>;
  /** Desde qué puesto se mira: cambia el verbo de la mesa libre, y solo eso.
      Ver `SalonPuesto` en lib/table-state.ts. */
  puesto?: SalonPuesto;
  /** Qué número lleva grande la ficha (M-21). Sin decir nada, el de este
      puesto: «tiempo» en el mando y «total» en servicio. */
  metrica?: SalonMetrica;
}

/**
 * Las mesas del salón, ordenadas como se trabaja en hora pico: primero
 * lo que pide algo, luego lo que está en marcha, y al final las libres.
 * Dentro de cada grupo manda el número.
 */
export function buildSalonTables(input: BuildSalonInput): SalonTable[] {
  const {
    tableCount, occupancy, calls, now, floorPlan, money, moneyShort, umbrales,
    seatings = {}, puesto = 'servicio',
    metrica = METRICA_POR_PUESTO[puesto],
  } = input;

  const sillas: Record<number, number> = {};
  const nombres: Record<number, string> = {};
  for (const t of floorPlan?.tables ?? []) {
    if (t.seats) sillas[t.n] = t.seats;
    const nombre = t.label?.trim();
    if (nombre) nombres[t.n] = nombre;
  }

  const base = tablesWithState(tableCount, occupancy, calls, now, umbrales, seatings);

  return byUrgency(base).map((t) => {
    const stage = tableStage(t.occ, t.state, t.seat);
    const ocupada = Boolean(t.occ || t.seat);
    /* Con gente, las personas que hay; libre, las sillas que tiene.
       Entre lo que anotó quien la sentó y lo que anotó quien tomó el pedido
       manda el número MAYOR, por el mismo criterio con que se juntan dos
       comandas de la misma mesa: si la segunda se apuntó sin preguntar, no
       por eso se sentó menos gente. */
    const pax = ocupada
      ? Math.max(t.occ?.partySize ?? 0, t.seat?.partySize ?? 0) || null
      : sillas[t.n] ?? null;
    const desde = stage.since ? new Date(stage.since).getTime() : NaN;
    return {
      n: t.n,
      state: t.state,
      stage,
      occ: t.occ,
      seat: t.seat,
      fuera: t.fuera,
      // El asignado manda sobre el que apuntó: repartir el salón es una
      // decisión, quedarse la mesa por apuntar primero es una casualidad.
      waiterName: t.seat?.waiterName ?? t.occ?.waiterName ?? null,
      waiterId: t.seat?.waiterId ?? null,
      waiterMark: marcaDeMesero(t.seat?.waiterName ?? t.occ?.waiterName ?? null),
      metrica: metricaDe(
        metrica,
        ocupada,
        t.occ ? money(t.occ.total) : null,
        now != null && Number.isFinite(desde) ? fmtMin((now - desde) / 60000) : null,
        pax,
        stage,
      ),
      action: tableAction(t.state, { sinPedido: !t.occ, puesto }),
      total: t.occ ? money(t.occ.total) : null,
      totalCorto: t.occ ? moneyShort(t.occ.total) : null,
      pax: pax != null ? `${pax} pers` : null,
      nombre: nombres[t.n] ?? null,
      tiempo: now != null && Number.isFinite(desde) ? fmtMin((now - desde) / 60000) : null,
    };
  });
}

/**
 * El número grande de la ficha (M-21).
 *
 * Devuelve siempre algo: una ficha con el hueco vacío se lee como un
 * fallo. Si la métrica elegida no aplica —«Cuenta» en una mesa sentada
 * que aún no pidió— se cae a la raya, que es la respuesta honesta.
 */
function metricaDe(
  cual: SalonMetrica,
  ocupada: boolean,
  total: string | null,
  tiempo: string | null,
  pax: number | null,
  stage: TableStage,
): { cual: SalonMetrica; valor: string; etiqueta: string } {
  if (!ocupada) return { cual, valor: '—', etiqueta: 'Libre' };
  switch (cual) {
    /* «28 min · en esta etapa» y no «28 min · En cocina»: el nombre de la
       etapa ya lo dice la ficha a la izquierda, y repetido debajo del
       número la ficha llegaba a decir «En cocina» tres veces. */
    case 'tiempo':
      return { cual, valor: tiempo ?? '—', etiqueta: 'en esta etapa' };
    case 'pax':
      return { cual, valor: pax != null ? String(pax) : '—', etiqueta: pax === 1 ? 'persona' : 'personas' };
    case 'etapa':
      return { cual, valor: stage.label, etiqueta: tiempo ?? '' };
    case 'total':
    default:
      return { cual, valor: total ?? '—', etiqueta: 'Cuenta' };
  }
}

/**
 * Lo que la ficha dice EN PEQUEÑO, sin repetir la métrica grande.
 *
 * El nombre del plano, las personas, quién atiende y el reloj. Se quita
 * el que ya está ocupando el sitio grande: leer «8 h 10 min · 8 h 10 min»
 * en una ficha de 168 px es peor que no tener métrica intercambiable.
 */
export function detalleDeFicha(t: SalonTable): string {
  const cual = t.metrica.cual;
  return [
    t.fuera && 'Sin configurar',
    t.nombre,
    cual !== 'pax' && t.pax,
    t.waiterName ?? 'Sin asignar',
    cual !== 'tiempo' && t.tiempo,
  ].filter(Boolean).join(' · ');
}

/* ── El color de cada mesero (M-05) ────────────────────────────
   Quién atiende cada mesa se decía con una línea de texto gris de 12 px.
   Con veinte mesas y cuatro meseros en hora pico, cada uno leía las
   veinte fichas para encontrar las suyas. Toast pone las iniciales sobre
   el color de esa persona; Lightspeed, el color en el borde.

   El color sale del NOMBRE, no de una tabla de asignaciones: así es
   estable entre pantallas y entre sesiones sin guardar nada, y no hay un
   ajuste más que administrar. Seis tonos —más se vuelven indistinguibles
   de un vistazo, que es justo lo que se venía a arreglar. */
const TONOS_MESERO = [
  '#2563eb', '#c2410c', '#7c3aed', '#0f766e', '#b91c1c', '#a16207',
] as const;

function marcaDeMesero(nombre: string | null): { iniciales: string; tono: string } | null {
  const limpio = nombre?.trim();
  if (!limpio) return null;

  const partes = limpio.split(/\s+/).filter(Boolean);
  const iniciales = (partes.length > 1
    ? partes[0][0] + partes[partes.length - 1][0]
    : limpio.slice(0, 2)).toUpperCase();

  /* Suma de códigos: no hace falta un hash de verdad para repartir seis
     colores entre cuatro personas, y así el mismo nombre cae siempre en
     el mismo tono en las dos pantallas. */
  let n = 0;
  for (let i = 0; i < limpio.length; i++) n = (n + limpio.charCodeAt(i)) % 4096;
  return { iniciales, tono: TONOS_MESERO[n % TONOS_MESERO.length] };
}

/* ── Cómo se lee el estado en una ficha ────────────────────────
   La ficha ya enseña el reloj en su propia fila (la etapa), así que
   aquí el estado va SIN tiempo: «En cocina», no «En cocina · 9 min».
   Repetir el minuto en dos renglones seguidos no informa, ocupa. */
const ESTADO_CORTO: Partial<Record<OrderStatus, string>> = {
  NEW: 'Pedido tomado',
  PREP: 'En cocina',
  READY: 'Lista',
  TRANSIT: 'En camino',
  SERVED: 'Servida',
};

/**
 * `largo` solo donde de verdad hay ancho.
 *
 * `TableState.short` existe exactamente para esto —lo dice su comentario:
 * «una ficha mide unos 95 px, ahí no cabe Servida hace 21 minutos»— y la
 * ficha no lo usaba. El resultado eran «Sin aceptar hace 10 min» y «Abierta
 * hace 31 h 1 min» partidos en dos renglones, y con la rejilla eso engorda
 * la fila entera de fichas, no solo la que se pasó.
 *
 * La FILA de la vista lista sí tiene el ancho de la pantalla, y ahí la
 * frase completa se lee mejor que la abreviatura.
 */
export function estadoDeFicha(t: SalonTable, largo = false): string {
  if (t.state.kind === 'libre') return 'Libre';
  if (t.state.kind === 'atencion') return largo ? t.state.label : t.state.short;
  const occ = t.occ;
  if (!occ) return largo ? t.state.label : t.state.short;
  if (occ.status === 'NEW') return occ.itemCount === 1 ? '1 plato' : `${occ.itemCount} platos`;
  return ESTADO_CORTO[occ.status] ?? t.state.short;
}

/**
 * El color del texto de estado.
 *
 * Acento SOLO para la alarma. El pendiente se dice con tinta plena —más
 * oscuro que la mesa que solo está comiendo, y eso basta para que salte al
 * recorrer la rejilla— sin gastar el único color que tiene el salón.
 */
export function estadoInk(t: SalonTable): string {
  switch (tableTone(t.state)) {
    case 'alarma': return 'var(--brand-accent-ink)';
    case 'aviso': return 'var(--u-text)';
    case 'libre': return 'var(--u-text-4)';
    default: return 'var(--u-text-3)';
  }
}

/** Cuánto tiempo lleva la etapa en curso, listo para pintar. */
export function tiempoDeEtapa(stage: TableStage, now: number | null): string | null {
  if (!stage.since || now == null) return null;
  const t = new Date(stage.since).getTime();
  if (!Number.isFinite(t)) return null;
  return fmtMin((now - t) / 60000);
}

/* ── Progreso de la comida ─────────────────────────────────────
   Cuatro tramos: Pedido tomado → En cocina → Servida → Por cobrar.
   Lo cumplido queda en tinta apagada, el paso actual en tinta plena
   (o en acento si la mesa pide algo) y lo que falta, casi invisible. */
export function StageBars({ stage, urgente }: { stage: TableStage; urgente: boolean }) {
  const vacio = 'color-mix(in srgb, var(--u-text) 8%, transparent)';
  return (
    <div className="salon-steps" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          style={{
            background:
              stage.index < 0 ? vacio
                : i < stage.index ? 'color-mix(in srgb, var(--u-text) 30%, transparent)'
                : i === stage.index ? (urgente ? 'var(--brand-accent)' : 'var(--u-text)')
                : vacio,
          }}
        />
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   LA FICHA
   ------------------------------------------------------------
   Número, personas, monto, estado, en qué va la comida, cuánto
   lleva, quién atiende y UNA acción. Todo lo que antes había que
   adivinar de un cuadrito de 86 px con tres palabras.
   ════════════════════════════════════════════════════════════ */
export function TableCard({
  t, onOpen, onAction, disabled, busy,
}: {
  t: SalonTable;
  /** Tocar la ficha (no el botón) abre la mesa al lado / en la hoja. */
  onOpen: () => void;
  onAction: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  const tono = tableTone(t.state);
  const urgente = tono === 'alarma';
  const libre = tono === 'libre';
  const num = (size: number, width?: number) => ({
    fontSize: size, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1,
    width, flexShrink: 0,
    color: libre ? 'var(--u-text-4)' : 'var(--u-text)',
  } as const);

  /* ── La mesa libre, dibujada como el hueco que es ─────────────
     Traía «Libre», «Sin abrir» y «Sin asignar» —un mesero para una
     mesa vacía— más un botón «Abrir mesa» del mismo peso que
     «Cobrar». Con veinte mesas y doce libres, la mayor parte del
     tablero eran tarjetas inertes idénticas compitiendo por la
     mirada con las tres que sí pedían algo.

     Queda el número, las sillas y nada más. Se abre tocándola: la
     tarjeta ENTERA es el botón, que además es más fácil de acertar
     que el rectángulo de 38 px que había dentro. */
  if (libre) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="press salon-card salon-hueco"
        data-kind="libre"
        data-tone="libre"
        /* El verbo sale de la acción y no de una frase fija: en Mesas la
           mesa libre se SIENTA y en Tomar pedidos se ABRE, y quien navega
           con lector de pantalla tiene que oír lo mismo que el resto lee. */
        aria-label={`Mesa ${t.n}, libre. ${t.action.label}`}
      >
        <span className="t-mono" style={num(24)}>{t.n}</span>
        {t.nombre && <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--u-text-3)' }}>{t.nombre}</span>}
        {t.pax && <span style={{ fontSize: 12, color: 'var(--u-text-4)' }}>{t.pax}</span>}
      </button>
    );
  }

  return (
    <div className="salon-card" data-kind={t.state.kind} data-tone={tono}>
      {/* El bloque de datos es un botón de verdad: abre la mesa. El de
          acción va aparte para no anidar botones (HTML inválido, y en
          la práctica un toque que dispara las dos cosas).

          Dos maquetas, una sola verdad: en PC la ficha cuenta la mesa
          entera (etapa de la comida incluida); en el teléfono se
          comprime a un renglón —número, qué pasa, quién atiende y
          cuánto—, porque catorce fichas de 250 px son cuatro pantallas
          de scroll para mirar un salón. */}
      <button
        type="button"
        onClick={onOpen}
        className="press salon-card-open"
        aria-label={`Mesa ${t.n} · ${t.state.label}`}
      >
        <span className="salon-card-full">
          <span style={{ display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%' }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 7, minWidth: 0 }}>
                <span className="t-mono" style={num(24)}>{t.n}</span>
                {/* El nombre del plano, si lo tiene. Recortado y no envuelto:
                    un «Terraza de arriba» de dos renglones engorda la fila
                    entera de fichas por culpa de una sola. */}
                {t.nombre && (
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--u-text-3)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.nombre}
                  </span>
                )}
                {t.pax && <span style={{ fontSize: 12, color: 'var(--u-text-4)', flexShrink: 0 }}>{t.pax}</span>}
                {t.fuera && <FueraChip />}
              </span>
              <span style={{ display: 'block', fontSize: 12.5, marginTop: 5, fontWeight: 600, color: estadoInk(t) }}>
                {estadoDeFicha(t)}
              </span>
            </span>
            {/* EL número de la ficha (M-21). Cuál es depende del puesto:
                el encargado mira tiempos y el mesero mira la cuenta, así
                que las dos pantallas dejan de dibujarse igual el primer
                día sin que nadie toque un ajuste. Lo demás no desaparece;
                lo que cambia es qué ocupa el sitio grande. */}
            <span style={{ flexShrink: 0, textAlign: 'right', minWidth: 0 }}>
              <span
                className="t-mono"
                style={{
                  display: 'block', fontSize: 14, fontWeight: 700, letterSpacing: '-0.02em',
                  color: 'var(--u-text-2)', whiteSpace: 'nowrap',
                }}
              >
                {t.metrica.valor}
              </span>
              {t.metrica.etiqueta && (
                <span style={{ display: 'block', fontSize: 10.5, color: 'var(--u-text-4)', lineHeight: 1.3, whiteSpace: 'nowrap' }}>
                  {t.metrica.etiqueta}
                </span>
              )}
            </span>
          </span>

          <StageBars stage={t.stage} urgente={urgente} />

          {/* La etapa y su reloj, salvo lo que la ficha ya esté diciendo
              (M-21): la métrica grande, o el estado de arriba — que en una
              mesa sin avisos ES la etapa («En cocina» y «En cocina»). Si no
              queda nada que decir, el renglón no se pinta. */}
          {(() => {
            const etapa = t.metrica.cual === 'etapa' || t.stage.label === estadoDeFicha(t) ? '' : t.stage.label;
            const reloj = t.tiempo && t.metrica.cual !== 'tiempo' ? t.tiempo : null;
            if (!etapa && !reloj) return null;
            return (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 11.5, color: 'var(--u-text-3)' }}>
                <span>{etapa}</span>
                {reloj && <span className="t-mono" style={{ fontWeight: 600 }}>{reloj}</span>}
              </span>
            );
          })()}

          <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--u-text-3)' }}>
            {t.waiterMark
              ? <MeseroMark mark={t.waiterMark} />
              : <Icon name="user" size={13} style={{ flexShrink: 0 }} />}
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {t.waiterName ?? 'Sin asignar'}
            </span>
          </span>
        </span>

        <span className="salon-card-compact">
          <span className="t-mono" style={num(26, 34)}>{t.n}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {t.waiterMark && <MeseroMark mark={t.waiterMark} />}
              <span style={{ fontSize: 15, fontWeight: 600, color: estadoInk(t), minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {estadoDeFicha(t)}
              </span>
            </span>
            <span style={{ display: 'block', fontSize: 13, color: 'var(--u-text-3)', marginTop: 1 }}>
              {detalleDeFicha(t)}
            </span>
          </span>
          {/* El mismo número que en la maqueta ancha (M-21): si el
              interruptor no llegara aquí, en el teléfono no haría nada —
              y el teléfono es donde más se mira este salón. */}
          <span
            className="t-mono"
            style={{
              fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', flexShrink: 0,
              color: 'var(--u-text)', whiteSpace: 'nowrap',
            }}
          >
            {t.metrica.valor}
          </span>
        </span>
      </button>

      <button
        type="button"
        className="salon-act press"
        data-primary={urgente ? '1' : '0'}
        onClick={onAction}
        disabled={disabled || busy}
      >
        {busy ? 'Un momento…' : t.action.label}
      </button>
    </div>
  );
}

/* ── Quién atiende, de un vistazo (M-05) ───────────────────────
   Las iniciales sobre el color de esa persona. El nombre sigue al lado:
   el color es para encontrar la mesa de lejos, no para adivinar de quién
   es. `aria-hidden` porque el nombre completo ya está en el mismo
   renglón — un lector de pantalla no necesita oír «CE» y luego «Carlos
   Encargado». */
function MeseroMark({ mark }: { mark: { iniciales: string; tono: string } }) {
  return (
    <span
      aria-hidden
      className="t-mono"
      style={{
        display: 'grid', placeItems: 'center', flexShrink: 0,
        width: 18, height: 18, borderRadius: 6,
        fontSize: 11, fontWeight: 700, letterSpacing: '0.02em',
        color: '#fff', background: mark.tono,
      }}
    >
      {mark.iniciales}
    </span>
  );
}

/* ── La mesa que el salón no tiene dada de alta ────────────────
   Tiene gente y su número se sale de `dineInTableCount`: pasa cuando el
   dueño baja el número de mesas después del servicio, o cuando un QR
   viejo mete un pedido en la 25 de un salón de 20. Antes desaparecía en
   silencio del salón y del total «Sin cobrar», con el dinero encima
   (M-03). Ahora se dibuja, y se dice por qué llama la atención. */
function FueraChip() {
  return (
    <span
      title="Esta mesa no está en las mesas configuradas del salón"
      style={{
        flexShrink: 0, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.02em',
        padding: '1px 6px', borderRadius: 6, textTransform: 'uppercase',
        color: 'var(--c-warn)',
        background: 'color-mix(in srgb, var(--c-warn) 14%, transparent)',
      }}
    >
      Sin configurar
    </span>
  );
}

/* ════════════════════════════════════════════════════════════
   LA FILA (vista Lista)
   ------------------------------------------------------------
   El mismo salón para quien prefiere leerlo de corrido: catorce
   renglones que caben de una vez, con el monto alineado por la
   coma para poder compararlos de un vistazo.
   ════════════════════════════════════════════════════════════ */
export function TableRow({
  t, onOpen, onAction, disabled, busy, primera,
}: {
  t: SalonTable;
  onOpen: () => void;
  onAction: () => void;
  disabled?: boolean;
  busy?: boolean;
  primera: boolean;
}) {
  const tono = tableTone(t.state);
  const urgente = tono === 'alarma';
  const libre = tono === 'libre';
  return (
    <div
      className="salon-row"
      data-tone={tono}
      style={{
        borderTop: primera ? 'none' : '1px solid var(--u-hair)',
        background: urgente ? 'color-mix(in srgb, var(--brand-accent) 5%, transparent)' : 'transparent',
      }}
    >
      <button
        type="button"
        onClick={onOpen}
        className="press salon-row-open"
        aria-label={libre ? `Mesa ${t.n}, libre. Tocar para abrirla` : undefined}
      >
        <span
          className="t-mono"
          style={{
            width: 34, flexShrink: 0, fontSize: 20, fontWeight: 700, letterSpacing: '-0.03em',
            color: libre ? 'var(--u-text-4)' : 'var(--u-text)',
          }}
        >
          {t.n}
        </span>
        {/* El renglón sí tiene el ancho de la pantalla: aquí la frase
            completa («Servida hace 21 min») se lee mejor que «Sin cobrar». */}
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, color: estadoInk(t) }}>
            {estadoDeFicha(t, true)}
          </span>
          {/* Una mesa libre no tiene mesero, ni etapa, ni «Sin abrir» que
              contar: ya lo dijo la palabra «Libre» de arriba. */}
          {!libre && (
            <span style={{ display: 'block', fontSize: 12.5, color: 'var(--u-text-3)', marginTop: 1 }}>
              {[
                t.fuera && 'Sin configurar',
                t.nombre,
                t.metrica.cual !== 'pax' && t.pax,
                t.waiterName ?? 'Sin asignar',
                /* La etapa solo si el estado de arriba no la dijo ya: en
                   una mesa sin avisos los dos son «En cocina», y la fila
                   decía «En cocina / Sin asignar · En cocina». */
                ...(() => {
                  const etapa = t.stage.label === estadoDeFicha(t, true) ? null : t.stage.label;
                  const reloj = t.tiempo && t.metrica.cual !== 'tiempo' ? t.tiempo : null;
                  return [etapa, reloj];
                })(),
              ].filter(Boolean).join(' · ')}
            </span>
          )}
          {libre && (t.nombre || t.pax) && (
            <span style={{ display: 'block', fontSize: 12.5, color: 'var(--u-text-4)', marginTop: 1 }}>
              {[t.nombre, t.pax].filter(Boolean).join(' · ')}
            </span>
          )}
        </span>
        {/* La fila también sigue la métrica (M-21): si el encargado eligió
            mirar tiempos, la vista Lista no puede seguir alineando montos. */}
        <span
          className="t-mono"
          style={{
            flexShrink: 0, fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em',
            color: libre ? 'var(--u-text-4)' : 'var(--u-text)',
          }}
        >
          {libre ? '' : t.metrica.valor}
        </span>
      </button>
      {/* Sin botón en la mesa libre: «Abrir mesa» al lado de «Cobrar», con
          el mismo peso y repetido doce veces, es lo que hacía que el salón
          pareciera una pared de botones. Tocar el renglón la abre. */}
      {!libre && (
        <button
          type="button"
          className="salon-act press"
          data-primary={urgente ? '1' : '0'}
          onClick={onAction}
          disabled={disabled || busy}
        >
          {busy ? 'Un momento…' : t.action.label}
        </button>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   EL PIN DEL PLANO
   ------------------------------------------------------------
   Ya no es un círculo con un número. Lleva número, personas, monto,
   estado y mesero: el plano deja de ser un mapa mudo y pasa a ser
   la misma información del salón, colocada como está el local.
   ════════════════════════════════════════════════════════════ */
export function TablePin({
  t, x, y, selected, onSelect,
}: {
  t: SalonTable;
  /** 0..1 dentro del lienzo. */
  x: number;
  y: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const tono = tableTone(t.state);
  const libre = tono === 'libre';
  return (
    <button
      type="button"
      className="salon-pin press"
      data-kind={t.state.kind}
      data-tone={tono}
      data-sel={selected ? '1' : '0'}
      onClick={onSelect}
      style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
      aria-label={`Mesa ${t.n} · ${t.state.label}`}
      aria-current={selected ? 'true' : undefined}
    >
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span
          className="t-mono"
          style={{
            fontSize: 19, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1,
            color: libre ? 'var(--u-text-4)' : 'var(--u-text)',
          }}
        >
          {t.n}
        </span>
        {/* `nowrap` y recorte: a 100 px de ancho, «4 pers» partido en dos
            renglones descuadra el pin entero. En el plano el nombre manda
            sobre las sillas — quien mira el plano ya sabe dónde está la
            mesa, lo que quiere saber es cómo la llaman. */}
        {(t.nombre || t.pax) && (
          <span style={{ fontSize: 11, color: 'var(--u-text-4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
            {t.nombre ?? t.pax}
          </span>
        )}
        <span style={{ flex: 1 }} />
        {t.totalCorto && (
          <span className="t-mono" style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--u-text-2)', whiteSpace: 'nowrap' }}>
            {t.totalCorto}
          </span>
        )}
      </span>
      {/* En el plano, el hueco punteado YA dice que la mesa está libre:
          escribir «Libre» debajo del número es decirlo dos veces. */}
      {!libre && (
        <span style={{ fontSize: 11, lineHeight: 1.3, fontWeight: 600, color: estadoInk(t) }}>
          {t.state.short}
        </span>
      )}
      {/* En una mesa libre tampoco hay mesero que nombrar. */}
      {!libre && (
        <span style={{ fontSize: 10.5, color: 'var(--u-text-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {t.waiterName ?? 'Sin asignar'}
        </span>
      )}
    </button>
  );
}

