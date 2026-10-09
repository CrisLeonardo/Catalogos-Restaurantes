/* ============================================================
   SALUD DE LOS CLIENTES — qué merece la atención del Super Admin
   ------------------------------------------------------------
   PLAN_ACCESO_Y_MONITOREO_2026-10-08, MON-03/04. Los datos salen de la
   migración 138 (una consulta para todos); aquí solo se decide, sin red,
   para poder probarlo.

   `grave`: lo que además se manda al celular (MON-04). Solo lo que le
   cuesta dinero AHORA al cliente: la PC del local caída en horario de
   servicio, o muchas comandas sin imprimir. Lo demás (no vende, se trabó
   en el alta) se ve en el panel y basta.
   ============================================================ */

import { isOpenNow, type HourExceptions, type WeeklyHours } from '@/lib/hours';

export type SaludRestaurante = {
  restaurantId: string;
  nombre: string;
  creadoEn: string;
  pedidosActivos: boolean;
  ultimoPedidoEn: string | null;
  platillos: number;
  pcActiva: boolean | null;
  pcVistoEn: string | null;
  impresionesFallidas24h: number;
  horario: WeeklyHours | null;
  excepciones: HourExceptions | null;
  zonaHoraria: string | null;
};

export type CuentaSinRestaurante = {
  userId: string;
  email: string;
  nombre: string | null;
  creadaEn: string;
};

export type AlertaSalud = {
  key: string;
  tone: 'danger' | 'warn' | 'info';
  icon: string;
  title: string;
  body: string;
  href: string;
  cta: string;
  grave: boolean;
};

const DIA = 86_400_000;
export const DIAS_SIN_PEDIDOS = 7;
export const DIAS_SIN_PLATILLOS = 3;
export const MIN_PC_CAIDA = 15;
/** Desde cuántos días sin conectarse la PC ya no es «se cayó» sino «la dejaron». */
export const PC_DIAS_ABANDONADA = 1;
export const FALLIDAS_AVISO = 3;
export const FALLIDAS_GRAVE = 10;

function dias(desde: string, ahora: number): number {
  return Math.floor((ahora - new Date(desde).getTime()) / DIA);
}

function fecha(iso: string, zona: string | null): string {
  try {
    return new Intl.DateTimeFormat('es-GT', {
      day: 'numeric', month: 'long', timeZone: zona || 'America/Guatemala',
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

export function alertasDeSalud(
  restaurantes: SaludRestaurante[],
  cuentas: CuentaSinRestaurante[],
  ahora: number = Date.now(),
): AlertaSalud[] {
  const out: AlertaSalud[] = [];

  for (const r of restaurantes) {
    const ficha = `/super/restaurantes/${r.restaurantId}`;
    const edad = dias(r.creadoEn, ahora);

    // La PC principal dejó de reportar. Dos casos MUY distintos:
    //  · se cayó HOY (lleva menos de un día): urgente si es horario de
    //    servicio — sus comandas no se imprimen ahora mismo;
    //  · lleva DÍAS sin conectarse: no es una emergencia, es un local que
    //    dejó de usarla sin apagarla en Mi PC. Aviso en el panel, nunca al
    //    celular (sonaría cada 6 h para siempre). Visto en pantalla el
    //    2026-10-09: «hace 2160 h».
    if (r.pcActiva && r.pcVistoEn) {
      const min = Math.floor((ahora - new Date(r.pcVistoEn).getTime()) / 60_000);
      if (min >= PC_DIAS_ABANDONADA * 24 * 60) {
        const d = Math.floor(min / (24 * 60));
        out.push({
          key: `pc-${r.restaurantId}`, tone: 'warn', icon: 'monitor', grave: false,
          title: `La PC de ${r.nombre} lleva ${d} días sin conectarse`,
          body: `Sigue marcada como PC principal, pero no se conecta desde el ${fecha(r.pcVistoEn, r.zonaHoraria)}. Si ya no la usan, que la apaguen en Mi PC; si sí, sus comandas no se imprimen.`,
          href: ficha, cta: 'Ver ficha',
        });
      } else if (min >= MIN_PC_CAIDA
        && isOpenNow(r.horario, r.zonaHoraria || 'America/Guatemala', new Date(ahora), r.excepciones)) {
        out.push({
          key: `pc-${r.restaurantId}`, tone: 'danger', icon: 'monitor', grave: true,
          title: `La PC de ${r.nombre} no responde`,
          body: `${r.horario ? 'Está en horario de servicio' : 'No tiene horario puesto (cuenta como abierto)'} y su PC principal dejó de reportar hace ${min >= 120 ? `${Math.floor(min / 60)} h` : `${min} min`}: sus comandas no se imprimen solas.`,
          href: ficha, cta: 'Ver ficha',
        });
      }
    }

    if (r.impresionesFallidas24h >= FALLIDAS_AVISO) {
      const grave = r.impresionesFallidas24h >= FALLIDAS_GRAVE;
      out.push({
        key: `impresion-${r.restaurantId}`, tone: grave ? 'danger' : 'warn', icon: 'print', grave,
        title: `${r.impresionesFallidas24h} impresiones fallidas en ${r.nombre}`,
        body: 'En las últimas 24 h. Suele ser la impresora apagada, desconectada o sin papel.',
        href: ficha, cta: 'Ver ficha',
      });
    }

    // Sin platillos va ANTES que sin pedidos: es la causa, no el síntoma.
    if (r.platillos === 0 && edad >= DIAS_SIN_PLATILLOS) {
      out.push({
        key: `sin-platillos-${r.restaurantId}`, tone: 'warn', icon: 'utensils', grave: false,
        title: `${r.nombre} no tiene platillos`,
        body: `Lo creó hace ${edad} días y su menú sigue vacío: se trabó armando el catálogo. Buen momento para escribirle.`,
        href: ficha, cta: 'Ver ficha',
      });
      continue;
    }

    if (r.pedidosActivos && edad >= DIAS_SIN_PEDIDOS) {
      if (!r.ultimoPedidoEn) {
        out.push({
          key: `sin-pedidos-${r.restaurantId}`, tone: 'warn', icon: 'bag', grave: false,
          title: `${r.nombre} no ha recibido su primer pedido`,
          body: `Lleva ${edad} días con Leogin sin un solo pedido: puede que no haya compartido su menú. Escríbele.`,
          href: ficha, cta: 'Ver ficha',
        });
      } else if (dias(r.ultimoPedidoEn, ahora) >= DIAS_SIN_PEDIDOS) {
        out.push({
          key: `sin-pedidos-${r.restaurantId}`, tone: 'warn', icon: 'bag', grave: false,
          title: `${r.nombre} lleva ${dias(r.ultimoPedidoEn, ahora)} días sin pedidos`,
          body: `Su último pedido fue el ${fecha(r.ultimoPedidoEn, r.zonaHoraria)}. Puede estar dejando de usar Leogin.`,
          href: ficha, cta: 'Ver ficha',
        });
      }
    }
  }

  for (const c of cuentas) {
    const d = dias(c.creadaEn, ahora);
    out.push({
      key: `cuenta-${c.userId}`, tone: 'info', icon: 'user', grave: false,
      title: `${c.nombre || c.email} se registró y no creó su restaurante`,
      body: `Hace ${d === 1 ? '1 día' : `${d} días`} (${c.email}). Se trabó en el alta: escríbele.`,
      href: `/super/cuentas/${c.userId}`, cta: 'Ver cuenta',
    });
  }

  const orden = { danger: 0, warn: 1, info: 2 } as const;
  return out.sort((a, b) => orden[a.tone] - orden[b.tone]);
}

/** Cada cuánto se puede repetir el MISMO aviso al celular (MON-04). */
export const HORAS_ENTRE_AVISOS = 6;

/**
 * De las alertas graves, las que hay que mandar AHORA: las que no se
 * mandaron nunca o hace más de HORAS_ENTRE_AVISOS. El reloj corre cada hora;
 * sin esto, una PC caída toda la tarde sonaría cada hora.
 */
export function alertasPorAvisar(
  alertas: AlertaSalud[],
  enviadas: Map<string, string>,
  ahora: number = Date.now(),
): AlertaSalud[] {
  return alertas.filter((a) => {
    if (!a.grave) return false;
    const antes = enviadas.get(a.key);
    if (!antes) return true;
    return ahora - new Date(antes).getTime() >= HORAS_ENTRE_AVISOS * 3_600_000;
  });
}
