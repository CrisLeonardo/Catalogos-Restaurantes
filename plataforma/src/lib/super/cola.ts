/* ============================================================
   LA COLA DE TRABAJO DEL SUPERADMIN (ficha 4.9, línea N)
   ------------------------------------------------------------
   Maqueta aprobada el 2026-11-18:
   docs/diseno/MAQUETA_SUPERADMIN_NADA_SATURADO_2026-11-18.html.

   Antes el inicio era una lista de avisos sueltos: uno por síntoma (la
   PC caída y sus impresiones fallidas eran dos avisos del mismo
   problema) y sin estado. Aquí se arman ASUNTOS:

   · uno por restaurante y tipo (servicio afectado, cobranza, activación,
     seguimiento), con sus síntomas juntos y desde cuándo;
   · con una FIRMA de la evidencia: si lo resolviste o lo pospusiste y la
     evidencia es la misma, no vuelve; si cambió (otra caída, otro cobro,
     otro pedido), vuelve marcado como nuevo.

   Sin red ni base de datos: se prueba en cola.test.ts.
   ============================================================ */

import { alertasDeSalud, type CuentaSinRestaurante, type SaludRestaurante } from '@/lib/client-health';

export type TipoAsunto = 'servicio' | 'cobranza' | 'activacion' | 'seguimiento';
export type Tono = 'danger' | 'warn' | 'info';

export const TIPOS: { tipo: TipoAsunto; titulo: string; icono: string }[] = [
  { tipo: 'servicio', titulo: 'Servicio afectado', icono: 'monitor' },
  { tipo: 'cobranza', titulo: 'Cobranza', icono: 'wallet' },
  { tipo: 'activacion', titulo: 'Activación', icono: 'sparkle' },
  { tipo: 'seguimiento', titulo: 'Seguimiento', icono: 'clock' },
];

/** Lo que el inicio sabe del cobro de cada restaurante. */
export type CobroDeRestaurante = {
  restaurantId: string;
  nombre: string;
  activo: boolean;
  planNombre: string;
  pendiente: number;
  vencido: boolean;
  /** YYYY-MM-DD del vencimiento más viejo. */
  vencidoDesde: string | null;
  sinTarifa: boolean;
  /** Días que le quedan de prueba, o null si no está en prueba. */
  pruebaDias: number | null;
  /** «Q349.00», ya con su moneda. */
  pendienteTexto: string;
};

/** El estado guardado de un asunto (migración 187). */
export type EstadoGuardado = {
  estado: 'pospuesto' | 'resuelto';
  hasta: string | null;
  motivo: string | null;
  evidencia: string;
};

export type Asunto = {
  clave: string;
  tipo: TipoAsunto;
  tono: Tono;
  restaurantId: string | null;
  nombre: string;
  /** Una línea: los síntomas juntos. */
  resumen: string;
  /** Las pruebas, una por síntoma, para la hoja. */
  evidencia: { etiqueta: string; texto: string }[];
  /** Firma de la evidencia: lo que se guarda al resolver o posponer. */
  firma: string;
  /** Desde cuándo pasa (ISO), si se sabe. */
  desde: string | null;
  href: string;
  /** Se había resuelto o pospuesto y volvió porque cambió la evidencia o venció la fecha. */
  volvio: 'evidencia' | 'fecha' | null;
};

export type Pospuesto = Asunto & { hasta: string; motivo: string | null };

export type Cola = {
  grupos: { tipo: TipoAsunto; titulo: string; icono: string; asuntos: Asunto[] }[];
  pospuestos: Pospuesto[];
  resueltos: number;
  total: number;
};

type Borrador = Omit<Asunto, 'volvio' | 'resumen' | 'firma' | 'tono'> & {
  partes: { resumen: string; firma: string; tono: Tono }[];
};

const RANGO: Record<Tono, number> = { danger: 0, warn: 1, info: 2 };

/** «1 oct» de un YYYY-MM-DD. */
function diaCorto(ymd: string): string {
  try {
    return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('es-GT', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  } catch {
    return ymd;
  }
}

/** «hace 20 min», «hace 3 h», «12 días». */
export function antiguedad(desde: string | null, ahora: number = Date.now()): string | null {
  if (!desde) return null;
  const t = new Date(desde.length === 10 ? `${desde}T12:00:00Z` : desde).getTime();
  if (Number.isNaN(t)) return null;
  const min = Math.max(0, Math.floor((ahora - t) / 60_000));
  if (min < 60) return `hace ${min} min`;
  if (min < 24 * 60) return `hace ${Math.floor(min / 60)} h`;
  const d = Math.floor(min / (24 * 60));
  return d === 1 ? '1 día' : `${d} días`;
}

export function armarCola({
  restaurantes, cuentas, cobros, guardados, ahora = Date.now(),
}: {
  restaurantes: SaludRestaurante[];
  cuentas: CuentaSinRestaurante[];
  cobros: CobroDeRestaurante[];
  guardados: Map<string, EstadoGuardado>;
  ahora?: number;
}): Cola {
  const porClave = new Map<string, Borrador>();
  const salud = new Map(restaurantes.map((r) => [r.restaurantId, r]));
  const dia = new Date(ahora).toISOString().slice(0, 10);

  function agregar(
    clave: string, base: Omit<Borrador, 'partes' | 'evidencia' | 'clave'>,
    parte: { resumen: string; firma: string; tono: Tono }, evidencia: { etiqueta: string; texto: string },
  ) {
    const b = porClave.get(clave) ?? { ...base, clave, partes: [], evidencia: [] };
    b.partes.push(parte);
    b.evidencia.push(evidencia);
    if (base.desde && (!b.desde || base.desde < b.desde)) b.desde = base.desde;
    porClave.set(clave, b);
  }

  for (const a of alertasDeSalud(restaurantes, cuentas, ahora)) {
    const [prefijo, ...resto] = a.key.split('-');
    const id = resto.join('-');
    if (prefijo === 'cuenta') {
      const c = cuentas.find((x) => x.userId === id);
      agregar(`activacion:cuenta:${id}`, {
        tipo: 'activacion', restaurantId: null, nombre: c?.nombre || c?.email || 'Cuenta nueva',
        desde: c?.creadaEn ?? null, href: a.href,
      }, { resumen: 'Se registró y no creó su restaurante', firma: 'sin-restaurante', tono: 'info' },
      { etiqueta: 'Alta', texto: a.body });
      continue;
    }
    // pc-<id>, impresion-<id>, sin-platillos-<id>, sin-pedidos-<id>
    const tipoAlerta = a.key.startsWith('sin-platillos-') ? 'sin-platillos'
      : a.key.startsWith('sin-pedidos-') ? 'sin-pedidos' : prefijo;
    const rid = a.key.slice(tipoAlerta.length + 1);
    const r = salud.get(rid);
    const nombre = r?.nombre ?? 'Restaurante';
    const base = { restaurantId: rid, nombre, href: `/super/restaurantes/${rid}` };

    if (tipoAlerta === 'pc') {
      const caida = a.tone === 'danger';
      agregar(`servicio:${rid}`, { ...base, tipo: 'servicio', desde: r?.pcVistoEn ?? null }, {
        resumen: caida ? 'La PC no responde' : 'La PC no se conecta hace días',
        firma: `pc@${r?.pcVistoEn ?? ''}`, tono: a.tone,
      }, { etiqueta: 'PC principal', texto: a.body });
    } else if (tipoAlerta === 'impresion') {
      const n = r?.impresionesFallidas24h ?? 0;
      agregar(`servicio:${rid}`, { ...base, tipo: 'servicio', desde: null }, {
        resumen: `${n} impresiones fallidas`, firma: `imp@${dia}`, tono: a.tone,
      }, { etiqueta: 'Impresión', texto: `${n} en las últimas 24 h. ${a.body}` });
    } else if (tipoAlerta === 'sin-platillos') {
      agregar(`activacion:${rid}`, { ...base, tipo: 'activacion', desde: r?.creadoEn ?? null }, {
        resumen: 'Sin platillos desde el alta', firma: 'sin-platillos', tono: 'info',
      }, { etiqueta: 'Menú', texto: a.body });
    } else if (tipoAlerta === 'sin-pedidos') {
      const sinNinguno = !r?.ultimoPedidoEn;
      agregar(`seguimiento:${rid}`, { ...base, tipo: 'seguimiento', desde: r?.ultimoPedidoEn ?? r?.creadoEn ?? null }, {
        resumen: sinNinguno ? 'Todavía sin su primer pedido' : a.title.replace(`${nombre} lleva `, 'Lleva '),
        firma: `ultimo@${r?.ultimoPedidoEn ?? 'nunca'}`, tono: 'info',
      }, { etiqueta: 'Pedidos', texto: a.body });
    }
  }

  for (const c of cobros) {
    if (!c.activo) continue;
    const base = { restaurantId: c.restaurantId, nombre: c.nombre, href: `/super/restaurantes/${c.restaurantId}/cobro` };
    if (c.vencido) {
      agregar(`cobranza:${c.restaurantId}`, { ...base, tipo: 'cobranza', desde: c.vencidoDesde }, {
        resumen: `Vencido ${c.pendienteTexto} · ${c.planNombre}`, firma: `pend@${c.pendiente.toFixed(2)}`, tono: 'warn',
      }, { etiqueta: 'Cobro', texto: `Debe ${c.pendienteTexto}${c.vencidoDesde ? `, vencido desde el ${diaCorto(c.vencidoDesde)}` : ''}. Sigue activo.` });
    }
    if (c.sinTarifa && c.pruebaDias == null) {
      agregar(`cobranza:${c.restaurantId}`, { ...base, tipo: 'cobranza', desde: null }, {
        resumen: 'Sin mensualidad configurada', firma: 'sin-tarifa', tono: 'warn',
      }, { etiqueta: 'Tarifa', texto: 'Está activo pero no genera cobro mensual. Configura su tarifa en la ficha.' });
    }
    if (c.pruebaDias != null && c.pruebaDias <= 5) {
      agregar(`activacion:${c.restaurantId}`, { ...base, tipo: 'activacion', desde: null, href: `/super/restaurantes/${c.restaurantId}` }, {
        resumen: `Su prueba termina en ${c.pruebaDias} ${c.pruebaDias === 1 ? 'día' : 'días'}`,
        firma: `prueba@${c.pruebaDias <= 1 ? 'fin' : 'pronto'}`, tono: 'info',
      }, { etiqueta: 'Prueba', texto: 'Buen momento para escribirle y confirmar su plan antes de que venza.' });
    }
  }

  const grupos = TIPOS.map((t) => ({ ...t, asuntos: [] as Asunto[] }));
  const pospuestos: Pospuesto[] = [];
  let resueltos = 0;

  for (const b of porClave.values()) {
    const tono = b.partes.reduce<Tono>((m, p) => (RANGO[p.tono] < RANGO[m] ? p.tono : m), 'info');
    const firma = b.partes.map((p) => p.firma).sort().join('|').slice(0, 200);
    const { partes, ...resto } = b;
    const asunto: Asunto = { ...resto, tono, firma, resumen: partes.map((p) => p.resumen).join(' · '), volvio: null };

    const g = guardados.get(b.clave);
    if (g) {
      const misma = g.evidencia === firma;
      if (misma && g.estado === 'resuelto') { resueltos += 1; continue; }
      if (misma && g.estado === 'pospuesto' && g.hasta && new Date(g.hasta).getTime() > ahora) {
        pospuestos.push({ ...asunto, hasta: g.hasta, motivo: g.motivo });
        continue;
      }
      asunto.volvio = misma ? 'fecha' : 'evidencia';
    }
    grupos.find((x) => x.tipo === asunto.tipo)!.asuntos.push(asunto);
  }

  const antes = (a: Asunto) => (a.desde ? new Date(a.desde.length === 10 ? `${a.desde}T12:00:00Z` : a.desde).getTime() : ahora);
  for (const g of grupos) {
    g.asuntos.sort((a, b) => RANGO[a.tono] - RANGO[b.tono] || antes(a) - antes(b) || a.nombre.localeCompare(b.nombre, 'es'));
  }
  pospuestos.sort((a, b) => a.hasta.localeCompare(b.hasta));

  return {
    grupos: grupos.filter((g) => g.asuntos.length > 0),
    pospuestos,
    resueltos,
    total: grupos.reduce((n, g) => n + g.asuntos.length, 0),
  };
}
