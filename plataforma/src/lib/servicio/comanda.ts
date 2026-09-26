/* ════════════════════════════════════════════════════════════
   LA COMANDA DE UNA MESA, EN TRES MONTONES
   ------------------------------------------------------------
   El módulo de servicio enseña una mesa como tres secciones seguidas:

     · SIN ENVIAR   — lo que el mesero acaba de apuntar. Solo vive en
                      este aparato; es lo único con ± y con ✎.
     · FALTA SERVIR — ya salió a cocina y todavía no está en la mesa.
     · EN LA MESA   — puesto delante del cliente. Solo se lee.

   Los tres montones salen de dos sitios distintos —el carrito local y
   los pedidos vivos de la base— y el resto del módulo no debería tener
   que saberlo. Aquí se juntan en UNA lista con una `fase`, y a partir
   de ahí todo (el pie, los chips del salón, el cobro, la paleta) mira
   la misma cosa.

   POR QUÉ NO BASTA `orders.status`. Hasta la migración 133 el estado
   era del pedido entero: una comanda de pepián + limonada no podía
   decir que la limonada ya estaba puesta. Ahora la línea manda
   (`served_at`), y el pedido solo se consulta como respaldo para todo
   lo anterior a esa migración — donde un pedido SERVED significa que
   sus líneas se sirvieron, aunque ninguna lo tenga escrito.
   ════════════════════════════════════════════════════════════ */

import { remainingQuantity, type OrderWithItems } from '@/lib/db/orders';
import { lineDetail, type CartLine } from '@/components/admin/waiter/cart';
import type { OrderItem, OrderStatus } from '@/types';

/** En qué va un renglón de la comanda. */
export type FaseLinea = 'nuevo' | 'cocina' | 'servido';

export interface LineaServicio {
  /** `lineId` del carrito, o el id de `order_items`. Único en la mesa. */
  id: string;
  fase: FaseLinea;
  productId: string | null;
  nombre: string;
  /** Precio de UNA unidad, extras incluidos. */
  unidad: number;
  cantidad: number;
  /** «Sin cebolla · Término medio · la salsa aparte». Vacío si no hay. */
  detalle: string;
  nota: string;
  /** Solo en `nuevo`: la línea del carrito, para el ± y la hoja de opciones. */
  carrito?: CartLine;
  /** Solo en las enviadas: de qué pedido es (anular, servir, cobrar). */
  orderId?: string;
  /** Solo en las enviadas: el estado del pedido al que pertenece. */
  estadoPedido?: OrderStatus;
  /** Ya saldada en un cobro por partes (migración 125 + `cobrarParteDeMesa`). */
  pagada: boolean;
  /** Artículo libre (M-09): no está en la carta y su precio lo escribió alguien. */
  libre: boolean;
  /** Ya se mandó a cocina y la nube todavía no lo confirma (ver EnvioEnVuelo):
      se pinta en «Falta servir», pero no se puede servir, anular ni cobrar. */
  enviando?: boolean;
}

/**
 * Una comanda que el mesero YA mandó y la nube todavía no confirma.
 *
 * «Enviar a cocina» no espera a la red: el carrito se vacía al tocar y sus
 * líneas pasan a «Falta servir» marcadas como enviándose, con el `clientId`
 * idempotente del pedido. En cuanto la mesa se vuelve a leer y trae un
 * pedido con ese `client_id`, las del vuelo sobran y no se pintan —así no
 * hay un fotograma con el plato repetido ni un hueco sin él—.
 */
export interface EnvioEnVuelo {
  clientId: string;
  lineas: CartLine[];
}

/** Lo que cuesta una línea entera. */
export function importeLinea(l: LineaServicio): number {
  return Math.round(l.unidad * l.cantidad * 100) / 100;
}

/** Lo que cuesta una línea del carrito, extras incluidos. */
export function unidadDeCarrito(l: CartLine): number {
  return l.price + l.options.reduce((s, o) => s + o.priceDelta, 0);
}

/**
 * ¿Esta línea ya está en la mesa?
 *
 * `served_at` manda. Cuando no lo hay —pedido anterior a la 133, o una
 * base donde la migración todavía no ha corrido— manda el pedido: SERVED
 * y DELIVERED significan que esto se sirvió. Se resuelve así y no
 * rellenando el pasado con un UPDATE porque el pasado no tiene la
 * información: nadie apuntó a qué hora salió cada plato.
 */
function lineaServida(item: OrderItem, estado: OrderStatus): boolean {
  if (item.served_at) return true;
  return estado === 'SERVED' || estado === 'DELIVERED';
}

/** Cómo se lee una línea ya enviada debajo de su nombre. */
function detalleDeItem(item: OrderItem): string {
  const partes = (item.options_snapshot ?? []).map((o) => o.variant ?? o.choice);
  if (item.note) partes.push(item.note);
  return partes.join(' · ');
}

/**
 * La comanda entera de una mesa: lo apuntado y lo enviado, en una lista.
 *
 * `pagadas` son los ids de línea que un cobro por partes ya saldó. No se
 * quitan de la lista a propósito: el diseño decía «cobrar una parte quita
 * esas líneas», y quitarlas de verdad sería anular una venta. Se quedan,
 * marcadas, y dejan de sumar en lo que falta por cobrar.
 */
export function comandaDeMesa(
  orders: OrderWithItems[],
  carrito: CartLine[],
  pagadas: ReadonlySet<string> = new Set(),
  enVuelo: readonly EnvioEnVuelo[] = [],
): LineaServicio[] {
  const out: LineaServicio[] = [];

  for (const l of carrito) {
    out.push({
      id: l.lineId,
      fase: 'nuevo',
      productId: l.open ? null : l.productId,
      nombre: l.name,
      unidad: unidadDeCarrito(l),
      cantidad: l.quantity,
      detalle: lineDetail(l),
      nota: l.note ?? '',
      carrito: l,
      pagada: false,
      libre: !!l.open,
    });
  }

  for (const o of orders) {
    const estado = o.status as OrderStatus;
    if (estado === 'CANCEL') continue;
    for (const item of o.items) {
      /* Lo anulado no está en la mesa ni se cobra: la línea que se anuló
         entera desaparece, la que se anuló a medias se queda con lo que
         sigue en pie (migración 079). */
      const quedan = remainingQuantity(item, o.voids);
      if (quedan <= 0) continue;
      out.push({
        id: item.id,
        fase: lineaServida(item, estado) ? 'servido' : 'cocina',
        productId: item.product_id,
        nombre: item.name_snapshot,
        unidad: item.price_snapshot,
        cantidad: quedan,
        detalle: detalleDeItem(item),
        nota: item.note ?? '',
        orderId: o.id,
        estadoPedido: estado,
        pagada: pagadas.has(item.id),
        libre: item.product_id == null,
      });
    }
  }

  /* Lo que va camino de la nube, al final de «Falta servir»: es lo último
     que se pidió. Si la mesa ya trae el pedido real, no se repite. */
  const confirmados = new Set(
    orders.map((o) => (o as { client_id?: string | null }).client_id).filter(Boolean),
  );
  for (const envio of enVuelo) {
    if (confirmados.has(envio.clientId)) continue;
    for (const l of envio.lineas) {
      out.push({
        id: `envio-${envio.clientId}-${l.lineId}`,
        fase: 'cocina',
        productId: l.open ? null : l.productId,
        nombre: l.name,
        unidad: unidadDeCarrito(l),
        cantidad: l.quantity,
        detalle: lineDetail(l),
        nota: l.note ?? '',
        pagada: false,
        libre: !!l.open,
        enviando: true,
      });
    }
  }

  return out;
}

/** Los tres montones y sus cuentas, ya resueltos. */
export interface ResumenComanda {
  nuevas: LineaServicio[];
  cocina: LineaServicio[];
  servidas: LineaServicio[];
  /** Unidades, no renglones: «Enviar a cocina · 3» son tres platos. */
  nNuevas: number;
  nCocina: number;
  nServidas: number;
  /** Unidades en total. */
  platos: number;
  /** Lo apuntado sin enviar. */
  totalNuevo: number;
  /** Lo que ya salió a cocina (servido o no). Es lo que se cobra. */
  totalEnviado: number;
  /** Los dos juntos: lo que la mesa lleva gastado. */
  total: number;
  /** Lo saldado en cobros por partes. */
  totalPagado: number;
  /** Lo que falta por cobrar de lo enviado. */
  porCobrar: number;
}

export function resumirComanda(lineas: LineaServicio[]): ResumenComanda {
  const nuevas = lineas.filter((l) => l.fase === 'nuevo');
  const cocina = lineas.filter((l) => l.fase === 'cocina');
  const servidas = lineas.filter((l) => l.fase === 'servido');
  const suma = (ls: LineaServicio[]) => Math.round(ls.reduce((s, l) => s + importeLinea(l), 0) * 100) / 100;
  const unidades = (ls: LineaServicio[]) => ls.reduce((s, l) => s + l.cantidad, 0);

  const enviadas = [...cocina, ...servidas];
  const totalNuevo = suma(nuevas);
  const totalEnviado = suma(enviadas);
  const totalPagado = suma(enviadas.filter((l) => l.pagada));

  return {
    nuevas, cocina, servidas,
    nNuevas: unidades(nuevas),
    nCocina: unidades(cocina),
    nServidas: unidades(servidas),
    platos: unidades(lineas),
    totalNuevo,
    totalEnviado,
    total: Math.round((totalNuevo + totalEnviado) * 100) / 100,
    totalPagado,
    porCobrar: Math.max(0, Math.round((totalEnviado - totalPagado) * 100) / 100),
  };
}

/* ── Teclear la comanda ────────────────────────────────────────
   «2 pepián» + Enter. Lo interpretado se enseña SIEMPRE en un chip
   antes de pulsar nada: si el sistema entendió otra cosa, tiene que
   verse antes y no después. */

/** Sin tildes, sin mayúsculas: «pepian» encuentra «Pepián». */
export function normalizar(s: string): string {
  return (s ?? '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** ¿El texto contiene todas las palabras buscadas? */
export function coincide(texto: string, busca: string): boolean {
  const t = normalizar(texto);
  const palabras = normalizar(busca).split(/\s+/).filter(Boolean);
  return palabras.length > 0 && palabras.every((w) => t.includes(w));
}

export interface Tecleado {
  /** Cuántas unidades. 1 si no se escribió número. */
  qty: number;
  /** Lo que queda para buscar el plato. */
  term: string;
}

/**
 * Parte «2 pepián» o «pepián x2» en cantidad y término.
 *
 * Un número SOLO no es cantidad: «7» es alguien empezando a escribir
 * «7 mares», no siete de nada. Es la misma regla que ya usaba el
 * buscador anterior (`dish-finder.parseQuery`), extendida al sufijo
 * «x2» que el prototipo del rediseño también acepta.
 */
export function leerComanda(raw: string): Tecleado {
  const texto = (raw ?? '').trim();
  if (!texto) return { qty: 1, term: '' };

  const prefijo = texto.match(/^(\d{1,2})\s*[x×]?\s+(\S.*)$/);
  if (prefijo) {
    const qty = Number(prefijo[1]);
    if (qty >= 1) return { qty: Math.min(99, qty), term: prefijo[2].trim() };
  }

  const sufijo = texto.match(/^(\S.*?)\s*[x×]\s*(\d{1,2})$/);
  if (sufijo) {
    const qty = Number(sufijo[2]);
    if (qty >= 1) return { qty: Math.min(99, qty), term: sufijo[1].trim() };
  }

  return { qty: 1, term: texto };
}
