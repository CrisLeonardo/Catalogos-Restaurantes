/* ============================================================
   HOY POR ETAPA (fichas 2.1 y 2.2 de la auditoría integral)
   ------------------------------------------------------------
   Maqueta aprobada: docs/diseno/MAQUETA_HOY_POR_ETAPA_2026-11-15.html

   Hoy responde tres preguntas —qué necesita atención, cuánto se
   cobró y cómo va el servicio— y cambia según el momento del local:

     · nuevo     → la guía «Llega a tu primer pedido» manda.
     · operando  → arriba, hasta tres cosas que piden acción; luego
                   el dinero y el servicio.
     · cerrado   → la caja ya se cerró hoy y no queda nada vivo:
                   el resultado del día y lo de mañana.

   Aquí solo hay reglas puras (con pruebas en hoy-etapa.test.ts);
   las lecturas viven en lib/db/hoy-etapa.ts.
   ============================================================ */

import type { OrderStatus } from '@/types';

export type EtapaHoy = 'nuevo' | 'operando' | 'cerrado';

export function etapaDeHoy(e: {
  /** La guía de primeros pasos sigue sin terminar y sin omitir. */
  guiaPendiente: boolean;
  /** Hubo al menos un cierre de caja en el día de negocio. */
  cerroHoy: boolean;
  /** Hay un turno de caja abierto ahora. */
  turnoAbierto: boolean;
  /** Cobrado desde el último cierre. */
  cobradoDesdeCierre: number;
  /** Pedidos vivos (sin entregar ni cancelar). */
  pedidosVivos: number;
}): EtapaHoy {
  if (e.guiaPendiente) return 'nuevo';
  if (e.cerroHoy && !e.turnoAbierto && e.cobradoDesdeCierre <= 0 && e.pedidosVivos === 0) return 'cerrado';
  return 'operando';
}

/* ── Primeros pasos por resultado ───────────────────────────── */

export type ClavePaso = 'platillos' | 'carta' | 'prueba' | 'qr';

export interface PasoPrimerPedido {
  clave: ClavePaso;
  hecho: boolean;
}

/**
 * Los tres pasos, cada uno marcado por algo que PASÓ (A02), no por un
 * formulario lleno. Con pedidos en el plan, el tercero es recibir un pedido
 * (el de prueba o uno real); sin pedidos, que la carta llegue a la gente
 * —la guía nunca dice «tus clientes pueden pedir» si el plan no lo deja—.
 */
export function pasosPrimerPedido(e: {
  platillos: number;
  visitas: number;
  personasDistintas: number;
  conPedidos: boolean;
  /** Un pedido de prueba llegó a «listo», o ya se entregó uno real. */
  pedidoRecorrido: boolean;
}): PasoPrimerPedido[] {
  return [
    { clave: 'platillos', hecho: e.platillos > 0 },
    { clave: 'carta', hecho: e.visitas > 0 },
    e.conPedidos
      ? { clave: 'prueba', hecho: e.pedidoRecorrido }
      : { clave: 'qr', hecho: e.personasDistintas >= 3 },
  ];
}

/* ── Lo que pide acción ─────────────────────────────────────── */

export type NivelAviso = 'urgente' | 'aviso' | 'info';

export interface Excepcion {
  key: string;
  nivel: NivelAviso;
  titulo: string;
  detalle: string;
  accion: string;
  /** Ruta del panel, sin prefijo (se arma con panelHref). */
  ruta: string;
}

export interface PedidoVivo {
  id: string;
  status: OrderStatus;
  order_type: 'PICKUP' | 'DELIVERY' | 'DINE_IN';
  created_at: string;
  accepted_at: string | null;
  ready_at: string | null;
  total: number;
  /** «Mesa 7», «Para llevar», «Domicilio». */
  etiqueta: string;
  /** Nombre del cliente, solo si no repite la etiqueta. */
  cliente: string | null;
  es_prueba: boolean;
}

/** Un pedido lleva más de esto en cocina y se avisa. */
export const COCINA_ATASCADA_MS = 60 * 60_000;
/** La comida lista espera más de esto en el pase y se avisa. */
export const LISTO_ESPERANDO_MS = 10 * 60_000;
/** Cuántas filas de «Atender» se ven sin abrir el resto. */
export const MAX_EXCEPCIONES = 3;

const NIVEL_ORDEN: Record<NivelAviso, number> = { urgente: 0, aviso: 1, info: 2 };

/** «12 min», «1 h», «9 h 26 min». */
export function duracion(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const resto = min % 60;
  return resto === 0 ? `${h} h` : `${h} h ${resto} min`;
}

const CANAL: Record<PedidoVivo['order_type'], string> = {
  PICKUP: 'Para llevar', DELIVERY: 'A domicilio', DINE_IN: 'Comer en local',
};

/**
 * Las excepciones del servicio, en el orden de la auditoría (R01.3):
 * pedido sin atender, comida atascada y comida lista que espera. Cada una
 * dice la causa, desde cuándo y qué hacer. `hora` da «6:12» en la zona del
 * local; `dinero` da «Q192.00».
 */
export function excepcionesDeServicio(
  pedidos: PedidoVivo[],
  ahora: number,
  hora: (iso: string) => string,
  dinero: (n: number) => string,
): Excepcion[] {
  const out: Excepcion[] = [];
  const edad = (iso: string | null) => (iso ? ahora - new Date(iso).getTime() : 0);

  const nuevos = pedidos.filter((p) => p.status === 'NEW')
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  if (nuevos.length > 0) {
    const primero = nuevos[0];
    const canales = [...new Set(nuevos.map((p) => CANAL[p.order_type]))];
    out.push({
      key: 'por-aceptar', nivel: 'urgente', ruta: '/admin/pedidos', accion: 'Aceptar',
      titulo: nuevos.length === 1 ? 'Un pedido espera que lo aceptes' : `${nuevos.length} pedidos esperan que los aceptes`,
      detalle: `${canales.length === 1 ? canales[0] : 'Varios canales'} · ${nuevos.length === 1 ? 'hace' : 'el primero hace'} ${duracion(edad(primero.created_at))}`,
    });
  }

  const atascados = pedidos
    .filter((p) => p.status === 'PREP' && edad(p.accepted_at ?? p.created_at) >= COCINA_ATASCADA_MS)
    .sort((a, b) => (a.accepted_at ?? a.created_at).localeCompare(b.accepted_at ?? b.created_at));
  if (atascados.length === 1) {
    const p = atascados[0];
    out.push({
      key: 'atascado', nivel: 'urgente', ruta: '/admin/pedidos', accion: 'Revisar',
      titulo: `${p.etiqueta} lleva ${duracion(edad(p.accepted_at ?? p.created_at))} en cocina`,
      detalle: `Pedido de las ${hora(p.created_at)} · ${dinero(p.total)}`,
    });
  } else if (atascados.length > 1) {
    const p = atascados[0];
    out.push({
      key: 'atascado', nivel: 'urgente', ruta: '/admin/pedidos', accion: 'Revisar',
      titulo: `${atascados.length} pedidos llevan más de una hora en cocina`,
      detalle: `El más antiguo: ${p.etiqueta}, ${duracion(edad(p.accepted_at ?? p.created_at))}`,
    });
  }

  const listos = pedidos
    .filter((p) => p.status === 'READY' && edad(p.ready_at) >= LISTO_ESPERANDO_MS)
    .sort((a, b) => (a.ready_at ?? '').localeCompare(b.ready_at ?? ''));
  if (listos.length === 1) {
    const p = listos[0];
    out.push({
      key: 'listo', nivel: 'aviso', ruta: '/admin/pedidos', accion: 'Ver',
      titulo: `La comida de ${p.etiqueta} está lista`,
      detalle: `Espera hace ${duracion(edad(p.ready_at))}`,
    });
  } else if (listos.length > 1) {
    out.push({
      key: 'listo', nivel: 'aviso', ruta: '/admin/pedidos', accion: 'Ver',
      titulo: `${listos.length} pedidos listos esperan salir`,
      detalle: `El primero espera hace ${duracion(edad(listos[0].ready_at))}`,
    });
  }
  return out;
}

/** Ordena por urgencia sin perder el orden de llegada dentro de cada nivel. */
export function ordenarExcepciones(lista: Excepcion[]): Excepcion[] {
  return lista
    .map((e, i) => ({ e, i }))
    .sort((a, b) => NIVEL_ORDEN[a.e.nivel] - NIVEL_ORDEN[b.e.nivel] || a.i - b.i)
    .map(({ e }) => e);
}

/* ── Servicio ───────────────────────────────────────────────── */

const ORDEN_SERVICIO: Partial<Record<OrderStatus, number>> = {
  READY: 0, NEW: 1, PREP: 2, TRANSIT: 3, SERVED: 4,
};

/** Lo listo primero —se enfría—; luego lo que espera, lo que se cocina y lo que va en camino. */
export function ordenarServicio(pedidos: PedidoVivo[]): PedidoVivo[] {
  return [...pedidos].sort((a, b) =>
    (ORDEN_SERVICIO[a.status] ?? 9) - (ORDEN_SERVICIO[b.status] ?? 9)
    || a.created_at.localeCompare(b.created_at));
}
