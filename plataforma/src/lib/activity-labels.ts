/* ============================================================
   LA BITÁCORA EN PALABRAS
   ------------------------------------------------------------
   `activity_log` guarda claves (`order_void`, `descuento_mesa`,
   `channel_toggle`…) y la pantalla de Personal las enseñaba tal
   cual cuando no conocía la acción: el dueño leía «order_void»,
   «auto_archive», «pedido → SERVED» (auditoría 2026-10-02, T-15).

   Aquí se traduce cada acción a una frase. Lo que no se conozca
   todavía se dice con palabras sueltas, nunca con la clave cruda.
   ============================================================ */

import { STATUS_LABEL } from '@/lib/order-status';
import type { OrderStatus } from '@/types';
import { fmtMoney } from '@/lib/money';

export type ActivityLike = {
  action: string;
  entity: string | null;
  meta: Record<string, unknown> | null;
  actor_name: string | null;
};

const CANAL: Record<string, string> = {
  delivery: 'A domicilio',
  pickup: 'Para llevar',
  dine_in: 'Comer en el local',
};

const ORIGEN_MESA: Record<string, string> = {
  reservation: 'de una reservación',
  waitlist: 'de la lista de espera',
  walk_in: '',
};

const esUuid = (s: string | null | undefined) =>
  !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Importe de una opción: «+Q5.00», «−Q2.00», «Q0.00». */
const signo = (n: number) => (n > 0 ? `+${fmtMoney(n)}` : n < 0 ? `−${fmtMoney(-n)}` : fmtMoney(0));

/** «10 % de descuento» / «Q20.00 de descuento»; vacío si no se sabe. */
function descuentoDeCupon(tipo: unknown, valor: unknown): string {
  const v = num(valor);
  if (v == null) return '';
  return tipo === 'PERCENT' ? `${v} % de descuento` : `${fmtMoney(v)} de descuento`;
}

/** «order_void» → «Order void»: lo último que se dice si no hay traducción. */
export function humanizarClave(clave: string): string {
  const t = clave.replace(/[_-]+/g, ' ').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : clave;
}

/** El verbo y su complemento, sin el sujeto («anuló un plato…»). */
function queHizo(r: ActivityLike): string {
  const m = r.meta ?? {};
  const e = r.entity ?? '';
  switch (r.action) {
    case 'order_status': {
      const estado = STATUS_LABEL[e as OrderStatus] ?? humanizarClave(e);
      return `pasó un pedido a «${estado}»`;
    }
    case 'order_void':
      return `anuló ${m.itemId ? 'un plato' : 'un pedido'}${e ? ` — «${e}»` : ''}`;
    case 'descuento_mesa': {
      const valor = num(m.valor);
      const monto = num(m.monto);
      const cuanto = m.tipo === 'percent' && valor != null
        ? `del ${valor} %`
        : monto != null ? `de ${fmtMoney(monto)}` : '';
      const motivo = typeof m.motivo === 'string' && m.motivo ? ` («${m.motivo}»)` : '';
      return `aplicó un descuento ${cuanto} en la mesa ${e}${motivo}`.replace(/\s+/g, ' ');
    }
    case 'articulo_libre':
      return `agregó un artículo fuera del menú al pedido ${e}`;
    case 'mesa': {
      if (m.soltar) return `liberó la mesa ${e}`;
      if (m.sentar) {
        const pax = num(m.pax);
        const origen = ORIGEN_MESA[String(m.source ?? '')] ?? '';
        return `sentó ${pax ? plural(pax, 'persona', 'personas') : 'clientes'} en la mesa ${e}${origen ? ` ${origen}` : ''}`;
      }
      return `corrigió los datos de la mesa ${e}`;
    }
    case 'auto_archive': {
      const n = num(String(e).match(/\d+/)?.[0]);
      return n != null
        ? `cerró solo ${plural(n, 'mesa abandonada', 'mesas abandonadas')}`
        : 'cerró solas las mesas abandonadas';
    }
    case 'staff': {
      const nombre = esUuid(e) ? '' : e;
      if (m.added) return `dio de alta a ${nombre || 'un miembro del personal'}`;
      if (m.removed) return `quitó a ${nombre || 'un miembro del personal'}`;
      if (m.password_reset) return `cambió la contraseña de ${nombre || 'un miembro del personal'}`;
      return `editó ${nombre ? `a ${nombre}` : 'el personal'}`;
    }
    case 'staff_pin_login':
      return 'entró con su PIN';
    case 'channel_toggle':
      return `${m.active ? 'encendió' : 'apagó'} «${CANAL[e] ?? humanizarClave(e)}»`;
    case 'vale': {
      const usado = num(m.redeemed);
      const monto = num(m.amount);
      if (usado != null) return `cobró ${fmtMoney(usado)} con el vale ${e}`;
      return `creó el vale ${e}${monto != null ? ` de ${fmtMoney(monto)}` : ''}`;
    }
    case 'dispositivo':
      return e ? `cambió los dispositivos del local: ${e}` : 'cambió los dispositivos del local';
    case 'driver_assign':
      return 'le asignó un pedido a un repartidor';
    case 'driver_delivered':
      return 'marcó un pedido como entregado';
    case 'whatsapp_connect':
      return 'conectó WhatsApp';
    case 'whatsapp_disconnect':
      return 'desconectó WhatsApp';
    case 'stock': {
      const delta = num(m.delta);
      return delta != null && delta !== 0
        ? `ajustó el inventario (${delta > 0 ? '+' : ''}${delta})`
        : 'ajustó el inventario';
    }
    case 'promo':
      return `cambió la promoción «${e}»`;
    /* ── Antifraude (PROD-10): precios, borrados, cupones, gastos,
       pausa y horario. Siempre con el importe, que es lo que se
       pregunta cuando algo no cuadra. */
    case 'precio': {
      const partes: string[] = [];
      const base = m.precio as { antes?: unknown; despues?: unknown } | null | undefined;
      if (base && num(base.antes) != null && num(base.despues) != null) {
        partes.push(`${fmtMoney(num(base.antes)!)} → ${fmtMoney(num(base.despues)!)}`);
      }
      const opciones = Array.isArray(m.opciones) ? (m.opciones as { que?: unknown; antes?: unknown; despues?: unknown }[]) : [];
      for (const o of opciones.slice(0, 2)) {
        const a = num(o.antes);
        const d = num(o.despues);
        if (a == null || d == null) continue;
        partes.push(`${String(o.que ?? 'una opción')}: ${signo(a)} → ${signo(d)}`);
      }
      if (opciones.length > 2) partes.push(`y ${plural(opciones.length - 2, 'opción más', 'opciones más')}`);
      return `cambió el precio de «${e}»${partes.length ? ` (${partes.join('; ')})` : ''}`;
    }
    case 'platillo_borrado': {
      const precio = num(m.precio);
      return `borró el platillo «${e}»${precio != null ? ` de ${fmtMoney(precio)}` : ''}`;
    }
    case 'categoria_borrada':
      return `borró la categoría «${e}»`;
    case 'cupon': {
      const cuanto = descuentoDeCupon(m.tipo, m.valor);
      switch (m.evento) {
        case 'creado': return `creó el cupón ${e}${cuanto ? ` (${cuanto})` : ''}`;
        case 'borrado': return `borró el cupón ${e}${cuanto ? ` (${cuanto})` : ''}`;
        case 'activado': return `activó el cupón ${e}`;
        case 'desactivado': return `desactivó el cupón ${e}`;
        default: {
          const antes = m.antes as { tipo?: unknown; valor?: unknown } | null | undefined;
          const antesTxt = antes ? descuentoDeCupon(antes.tipo, antes.valor) : '';
          if (antesTxt && cuanto && antesTxt !== cuanto) return `editó el cupón ${e} (${antesTxt} → ${cuanto})`;
          return `editó el cupón ${e}${cuanto ? ` (${cuanto})` : ''}`;
        }
      }
    }
    case 'gasto': {
      const monto = num(m.monto);
      const verbo = m.evento === 'borrado' ? 'borró' : 'anotó';
      return `${verbo} un gasto de caja${monto != null ? ` de ${fmtMoney(monto)}` : ''}${e ? ` — «${e}»` : ''}`;
    }
    case 'pausa_pedidos':
      return m.pausado ? 'pausó los pedidos en línea' : 'reanudó los pedidos en línea';
    case 'horario':
      return 'cambió el horario del restaurante';
    /* Caja (migración 145). */
    case 'turno_abierto': {
      const fondo = num(m.fondo);
      return `abrió el turno de caja${fondo != null ? ` con ${fmtMoney(fondo)} de fondo` : ''}`;
    }
    case 'turno_cerrado': {
      const dif = num(m.diferencia);
      const cuadre = dif == null ? '' : Math.abs(dif) < 0.005 ? ' (cuadrada)'
        : dif > 0 ? ` (sobraron ${fmtMoney(dif)})` : ` (faltaron ${fmtMoney(-dif)})`;
      return `cerró el turno de caja${cuadre}`;
    }
    case 'corte_anulado':
      return `anuló un corte de caja${e ? ` — «${e}»` : ''}`;
    case 'cobro_metodo_corregido': {
      const motivo = typeof m.motivo === 'string' && m.motivo ? ` («${m.motivo}»)` : '';
      return `corrigió cómo se pagó el pedido ${e}${motivo}`;
    }
    case 'mesa_reabierta': {
      const motivo = typeof m.motivo === 'string' && m.motivo ? ` («${m.motivo}»)` : '';
      return `reabrió la mesa ${e}, cobrada por error${motivo}`;
    }
    case 'devolucion': {
      const monto = num(m.monto);
      const motivo = typeof m.motivo === 'string' && m.motivo ? ` («${m.motivo}»)` : '';
      return `devolvió ${monto != null ? fmtMoney(monto) : 'dinero'} del pedido ${e}${motivo}`;
    }
    default:
      return humanizarClave(r.action).toLowerCase() + (e && !esUuid(e) ? ` — ${e}` : '');
  }
}

/** Una línea de la bitácora: «Carlos anuló un plato — «se acabó»». */
export function describirActividad(r: ActivityLike): string {
  // Soporte de Leogin dentro del panel: el actor no es del restaurante, así
  // que el nombre va en `entity` y no en `actor_name` (no está en su staff).
  if (r.action === 'soporte') return `Soporte de Leogin entró al panel${r.entity ? ` (${r.entity})` : ''}`;
  const frase = queHizo(r);
  if (r.actor_name) return `${r.actor_name} ${frase}`;
  return frase.charAt(0).toUpperCase() + frase.slice(1);
}
