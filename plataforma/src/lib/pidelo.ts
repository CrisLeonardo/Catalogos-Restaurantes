import type { CartItem } from '@/types';

/* ============================================================
   «Pídelo tú mismo» — el pedido de prueba de la demo
   ------------------------------------------------------------
   La venta de Leogin no es «un menú bonito»: es «el pedido entra
   solo y suena». Hasta 2026-10-27 eso solo se contaba; la demo
   dejaba elegir término y extras y terminaba en el precio, sin
   botón (auditoría de experiencia, EV-01). Ahora el visitante pide
   y ve —y oye— cómo le llega a la cocina.

   Dos caminos, sin base de datos:
     · En el mismo aparato: al enviar, la demo enseña el panel.
     · Celular + PC: la web abre una SALA con un código de un solo
       uso y lo pone en el QR (`?sala=`). El celular manda el pedido
       por un canal de difusión de Supabase Realtime (`pidelo:<sala>`)
       y la PC, escuchando ese canal, lo hace sonar en su panel.
   Nada se guarda: la difusión no toca ninguna tabla.

   Lo que llega por el canal lo puede escribir cualquiera que sepa
   el código, así que se trata como entrada ajena: `limpiarPedido`
   recorta largos, cantidades y número de líneas, y descarta lo que
   no tenga forma de pedido. React escapa el texto al pintarlo.
   ============================================================ */

export interface LineaDemo {
  nombre: string;
  cantidad: number;
  /** «Término medio · Tocino», o '' sin opciones. */
  detalle: string;
}

export interface PedidoDemo {
  /** Nombre que escribió el visitante, o '' si lo dejó vacío. */
  cliente: string;
  lineas: LineaDemo[];
  total: number;
  /** Cuándo se envió (ms), para el «hace 3 s» del panel. */
  enviado: number;
}

export const EVENTO_PEDIDO = 'pedido';
export const MAX_LINEAS = 12;
const MAX_NOMBRE = 24;
const MAX_PLATILLO = 40;
const MAX_DETALLE = 60;
const MAX_CANTIDAD = 20;

/** Código de sala: 8 caracteres sin los que se confunden (0/O, 1/l/I). */
const ALFABETO = 'abcdefghjkmnpqrstuvwxyz23456789';
const SALA_RE = /^[a-hj-km-np-z2-9]{8}$/;

export function nuevaSala(azar: (n: number) => Uint8Array = aleatorio): string {
  return Array.from(azar(8), (b) => ALFABETO[b % ALFABETO.length]).join('');
}

function aleatorio(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

/** La sala de la URL, o null si no tiene forma de sala. */
export function salaValida(valor: string | null | undefined): string | null {
  return valor && SALA_RE.test(valor) ? valor : null;
}

export function canalDeSala(sala: string): string {
  return `pidelo:${sala}`;
}

/** Un texto ajeno: solo cadenas, sin saltos ni espacios de más, y recortado. */
function texto(valor: unknown, max: number): string {
  if (typeof valor !== 'string') return '';
  return valor.replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Arma el pedido de prueba con lo que hay en el carrito. */
export function pedidoDesdeCarrito(items: CartItem[], cliente: string, ahora: number = Date.now()): PedidoDemo {
  const lineas = items.slice(0, MAX_LINEAS).map((i) => ({
    nombre: texto(i.name, MAX_PLATILLO),
    cantidad: Math.min(MAX_CANTIDAD, Math.max(1, Math.round(i.quantity))),
    detalle: texto((i.options ?? []).map((o) => o.choiceName).join(' · '), MAX_DETALLE),
  }));
  const total = items.reduce((s, i) => s + i.price * i.quantity, 0);
  return { cliente: texto(cliente, MAX_NOMBRE), lineas, total: Math.round(total * 100) / 100, enviado: ahora };
}

/** Lo que llegó por el canal, limpio — o null si no es un pedido. */
export function limpiarPedido(crudo: unknown, ahora: number = Date.now()): PedidoDemo | null {
  if (!crudo || typeof crudo !== 'object') return null;
  const p = crudo as Record<string, unknown>;
  if (!Array.isArray(p.lineas)) return null;

  const lineas: LineaDemo[] = [];
  for (const l of p.lineas.slice(0, MAX_LINEAS)) {
    if (!l || typeof l !== 'object') continue;
    const r = l as Record<string, unknown>;
    const nombre = texto(r.nombre, MAX_PLATILLO);
    const cantidad = typeof r.cantidad === 'number' && Number.isFinite(r.cantidad)
      ? Math.min(MAX_CANTIDAD, Math.max(1, Math.round(r.cantidad)))
      : 1;
    if (nombre) lineas.push({ nombre, cantidad, detalle: texto(r.detalle, MAX_DETALLE) });
  }
  if (lineas.length === 0) return null;

  const total = typeof p.total === 'number' && Number.isFinite(p.total) && p.total >= 0
    ? Math.min(Math.round(p.total * 100) / 100, 99_999)
    : 0;
  // La hora del otro aparato no se cree: si viene del futuro o de hace
  // rato, el panel diría «hace −5 s» o «hace 3 h». Se usa la de llegada.
  const enviado = typeof p.enviado === 'number' && p.enviado <= ahora && ahora - p.enviado < 60_000
    ? p.enviado
    : ahora;

  return { cliente: texto(p.cliente, MAX_NOMBRE), lineas, total, enviado };
}
