/* ════════════════════════════════════════════════════════════
   EL SALÓN DEL MÓDULO DE SERVICIO
   ------------------------------------------------------------
   El handoff del rediseño trae su propio modelo de mesa: cuatro
   estados donde «el color es la información principal» —libre, sin
   enviar, falta servir, por cobrar—. El sistema ya tenía el suyo
   (`lib/table-state.ts`), construido sobre el principio contrario:
   «el color no describe, avisa».

   No se tira ninguno de los dos, porque los dos tienen razón sobre
   cosas distintas:

     · el ESTADO dice en qué va la comida de esa mesa. Eso es lo que
       el mesero mira para saber qué le toca hacer, y es lo que pinta
       la tarjeta. Cuatro colores, siempre los mismos.

     · la ATENCIÓN dice que alguien levantó la mano. Eso no es una
       etapa de la comida: es una persona esperando, y por eso va
       ENCIMA, como insignia, sin robarle el color al estado.

   Y se añade el quinto estado que el diseño no contemplaba:
   `sentada`. La hostess sienta a cuatro personas y todavía no han
   pedido; el diseño la habría pintado LIBRE. Perder eso era la mitad
   del hallazgo M-02 de la auditoría del 7 de septiembre: dos meseros
   yendo a la misma mesa sin saberlo.
   ════════════════════════════════════════════════════════════ */

import type { TableOccupancy, TableCall } from '@/lib/db/orders';
import type { TableSeating } from '@/lib/db/table-sessions';
import type { FloorPlan } from '@/lib/theme/defaults';

/** En qué va la mesa. El orden es el de urgencia para el mesero. */
export type EstadoServicio = 'borrador' | 'cocina' | 'listo' | 'sentada' | 'libre';

/** Cómo se llama cada estado en la tarjeta. */
export const ESTADO_LABEL: Record<EstadoServicio, string> = {
  borrador: 'Sin enviar',
  cocina: 'Falta servir',
  listo: 'Por cobrar',
  sentada: 'Sin pedir',
  libre: 'Libre',
};

/** Alguien levantó la mano. Va encima del estado, nunca en su lugar. */
export type AtencionServicio = 'cuenta' | 'llamada' | null;

export const ATENCION_LABEL: Record<'cuenta' | 'llamada', string> = {
  cuenta: 'Pidió la cuenta',
  llamada: 'Te llaman',
};

/** Los filtros de la fila superior del salón. */
export const FILTROS = ['Todas', 'Con pedido', 'Falta servir', 'Por cobrar', 'Libres'] as const;
export type FiltroSalon = (typeof FILTROS)[number];

export interface MesaServicio {
  /** El número de mesa. Es la identidad: el QR, el pedido y la cuenta van por él. */
  n: number;
  /** «Mesa 4», «Mesa 4 · cumpleaños de Sofi». */
  etiqueta: string;
  /** El nombre que alguien le puso a la mesa esta noche, si lo hay. */
  nombre: string;
  /** Cómo la llama el plano del dueño («Terraza 2»), si la bautizó. */
  alias: string | null;
  /** El nivel del plano al que pertenece: «Salón», «Terraza», «Barra». */
  zona: string | null;
  /** Sillas, del plano o de lo que se apuntó al sentarla. */
  sillas: number | null;
  estado: EstadoServicio;
  atencion: AtencionServicio;
  /** Desde cuándo está ocupada (ISO). `null` si está libre. */
  desde: string | null;
  /** Minutos que lleva abierta. `null` mientras no haya reloj de cliente. */
  minutos: number | null;
  /** Platos en la mesa, enviados y sin enviar. */
  platos: number;
  /** Unidades apuntadas en ESTE aparato y todavía sin enviar. */
  sinEnviar: number;
  /** Lo que lleva gastado, incluido lo que aún no ha salido a cocina. */
  total: number;
  /** Cosas que el comensal pidió por QR y nadie ha aceptado. */
  qrPendiente: number;
  /** Tiene pedido pero su número se sale del salón configurado (M-03). */
  fuera: boolean;
  /** Quién la está atendiendo. */
  mesero: string | null;
}

/** Qué hace falta para resolver una mesa. */
export interface EntradaSalon {
  tableCount: number;
  occupancy: Record<number, TableOccupancy>;
  calls: Record<number, TableCall>;
  seatings: Record<number, TableSeating>;
  /** Unidades sin enviar por mesa, del carrito de ESTE aparato. */
  sinEnviar: Record<number, number>;
  /** Lo apuntado sin enviar, en dinero, por mesa. */
  totalSinEnviar: Record<number, number>;
  /** Cosas pendientes de aceptar por mesa (pedidos del QR). */
  qrPendiente?: Record<number, number>;
  floorPlan: FloorPlan | null;
  /** `null` en el primer render del servidor: sin reloj no hay minutos. */
  now: number | null;
}

function minutosDesde(iso: string | null | undefined, now: number | null): number | null {
  if (!iso || now == null) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now - t) / 60000));
}

/**
 * ¿La llamada es de ESTA gente?
 *
 * Una llamada anterior a que se abriera la mesa es de quien se sentó
 * antes: se fueron, la mesa se liberó y nadie resolvió el aviso. Sin esta
 * comprobación, un «pidió la cuenta» olvidado secuestra una mesa que
 * acaba de sentarse — pasó de verdad, con «Pidió la cuenta · 145 h» en
 * una mesa de diecisiete minutos (ver `lib/table-state.ts`).
 */
function llamadaViva(call: TableCall | undefined, desde: string | null): TableCall | undefined {
  if (!call) return undefined;
  if (!desde) return call;
  const c = new Date(call.since).getTime();
  const d = new Date(desde).getTime();
  if (!Number.isFinite(c) || !Number.isFinite(d)) return call;
  return c >= d ? call : undefined;
}

/** «Mesa 4», «Mesa 4 · cumpleaños de Sofi», «Terraza 2». */
export function etiquetaDeMesa(n: number, nombre: string, alias: string | null): string {
  const base = alias?.trim() || `Mesa ${n}`;
  const propio = nombre.trim();
  return propio ? `${base} · ${propio}` : base;
}

/** Qué sabe el plano del dueño de cada mesa: su nivel, su alias y sus sillas. */
export function datosDelPlano(floorPlan: FloorPlan | null): Record<number, {
  zona: string | null; alias: string | null; sillas: number | null;
}> {
  const out: Record<number, { zona: string | null; alias: string | null; sillas: number | null }> = {};
  if (!floorPlan?.enabled) return out;
  const nivel = new Map(floorPlan.levels.map((l) => [l.id, l.name]));
  for (const t of floorPlan.tables) {
    out[t.n] = {
      zona: nivel.get(t.level) ?? null,
      alias: t.label?.trim() || null,
      sillas: t.seats ?? null,
    };
  }
  return out;
}

/**
 * El salón entero, mesa por mesa.
 *
 * Las mesas con pedido cuyo número se sale del salón configurado se
 * añaden igual, marcadas `fuera`: es el hallazgo M-03 y no se pierde por
 * cambiar de pantalla. El dueño baja el número de mesas en Ajustes y un
 * pedido de la 25 en un salón de 20 desaparecía de la vista con el dinero
 * dentro.
 */
export function mesasDeServicio(e: EntradaSalon): MesaServicio[] {
  const plano = datosDelPlano(e.floorPlan);

  const una = (n: number, fuera: boolean): MesaServicio => {
    const occ = e.occupancy[n];
    const seat = e.seatings[n];
    const sinEnviar = e.sinEnviar[n] ?? 0;
    const qrPendiente = e.qrPendiente?.[n] ?? 0;
    const meta = plano[n];

    /* Desde cuándo está ocupada: lo que ocurrió ANTES manda. Una mesa que
       alguien sentó hace veinte minutos y pidió hace cinco lleva veinte,
       que además es la verdad que vive el comensal. */
    const desde = seat && (!occ || seat.seatedAt < occ.since)
      ? seat.seatedAt
      : (occ?.since ?? null);

    const call = llamadaViva(e.calls[n], desde);

    let estado: EstadoServicio;
    if (sinEnviar > 0) estado = 'borrador';
    else if (occ) estado = occ.status === 'SERVED' ? 'listo' : 'cocina';
    else if (seat) estado = 'sentada';
    else estado = 'libre';

    const nombre = (seat?.note ?? '').trim();

    return {
      n,
      nombre,
      alias: meta?.alias ?? null,
      etiqueta: etiquetaDeMesa(n, nombre, meta?.alias ?? null),
      zona: meta?.zona ?? null,
      sillas: meta?.sillas ?? occ?.partySize ?? seat?.partySize ?? null,
      estado,
      atencion: call ? (call.reason === 'bill' ? 'cuenta' : 'llamada') : null,
      desde,
      minutos: minutosDesde(desde, e.now),
      platos: (occ?.itemCount ?? 0) + sinEnviar,
      sinEnviar,
      total: Math.round(((occ?.total ?? 0) + (e.totalSinEnviar[n] ?? 0)) * 100) / 100,
      qrPendiente,
      fuera,
      mesero: occ?.waiterName ?? seat?.waiterName ?? null,
    };
  };

  const out: MesaServicio[] = [];
  for (let n = 1; n <= e.tableCount; n++) out.push(una(n, false));

  const desbordadas = new Set<number>();
  for (const clave of [
    ...Object.keys(e.occupancy), ...Object.keys(e.seatings), ...Object.keys(e.sinEnviar),
  ]) {
    const n = Number(clave);
    if (Number.isFinite(n) && n > e.tableCount && n >= 1) desbordadas.add(n);
  }
  for (const n of [...desbordadas].sort((a, b) => a - b)) out.push(una(n, true));

  return out;
}

/** ¿Esta mesa entra en el filtro elegido? */
export function pasaFiltro(m: MesaServicio, filtro: FiltroSalon): boolean {
  switch (filtro) {
    case 'Con pedido': return m.estado !== 'libre';
    case 'Falta servir': return m.estado === 'cocina' || m.qrPendiente > 0;
    case 'Por cobrar': return m.estado === 'listo';
    case 'Libres': return m.estado === 'libre';
    default: return true;
  }
}

/**
 * El resumen de una línea: «7 libres · 2 por cobrar · 3 por servir».
 *
 * Los tres números que un mesero mira al entrar. «Por servir» cuenta
 * MESAS y no platos: lo que se recorre son mesas, y decir «11 por servir»
 * cuando son dos mesas manda a nadie a ninguna parte.
 */
export function resumenDelSalon(mesas: MesaServicio[]): string {
  const libres = mesas.filter((m) => m.estado === 'libre').length;
  const porCobrar = mesas.filter((m) => m.estado === 'listo').length;
  const porServir = mesas.filter((m) => m.estado === 'cocina').length;
  const partes = [`${libres} ${libres === 1 ? 'libre' : 'libres'}`];
  if (porCobrar) partes.push(`${porCobrar} por cobrar`);
  if (porServir) partes.push(`${porServir} por servir`);
  const piden = mesas.filter((m) => m.atencion).length;
  if (piden) partes.push(`${piden} ${piden === 1 ? 'te llama' : 'te llaman'}`);
  return partes.join(' · ');
}

/**
 * Cómo se lee la segunda línea de una tarjeta.
 *
 * `corto` es para el riel estrecho de tablet (232 px), donde «42 min · 5
 * platos · QR nuevo» se parte en dos renglones y engorda las cuarenta
 * tarjetas de golpe.
 */
export function subtituloDeMesa(m: MesaServicio, corto = false): string {
  if (m.estado === 'libre') {
    /* Vacío y no «Libre»: el chip de estado ya lo dice, y la ficha
       repitiendo la misma palabra dos veces se lee como un error. Si el
       dueño dibujó el plano sí hay algo que aportar —dónde está y para
       cuántos—, y entonces se dice. */
    const partes = [m.zona, m.sillas ? `${m.sillas} personas` : null].filter(Boolean);
    return partes.join(' · ');
  }
  if (corto) {
    const base = ESTADO_LABEL[m.estado].toLowerCase();
    return m.qrPendiente > 0 ? `${base} · QR` : base;
  }
  const partes: string[] = [];
  if (m.minutos != null) partes.push(`${m.minutos} min`);
  if (m.platos > 0) partes.push(`${m.platos} ${m.platos === 1 ? 'plato' : 'platos'}`);
  else if (m.estado === 'sentada') partes.push(m.sillas ? `${m.sillas} personas` : 'sin pedir');
  if (m.qrPendiente > 0) partes.push('QR nuevo');
  return partes.join(' · ');
}

/**
 * El orden del salón: primero lo que pide algo.
 *
 * Dentro de cada grupo manda el número, porque la mesa 4 está al lado de
 * la 5 y un mesero recorre el salón caminando. Entre grupos manda la
 * urgencia, porque en hora pico nadie busca «la mesa 7»: busca qué
 * atender primero.
 */
const RANGO: Record<EstadoServicio, number> = {
  borrador: 0, listo: 1, cocina: 2, sentada: 3, libre: 4,
};

export function porUrgencia(mesas: MesaServicio[]): MesaServicio[] {
  return [...mesas].sort((a, b) => {
    // La mano levantada va delante de todo lo demás.
    const manoA = a.atencion ? 0 : 1;
    const manoB = b.atencion ? 0 : 1;
    if (manoA !== manoB) return manoA - manoB;
    const r = RANGO[a.estado] - RANGO[b.estado];
    if (r !== 0) return r;
    return a.n - b.n;
  });
}
