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
