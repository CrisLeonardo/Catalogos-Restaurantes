// A qué impresora va cada línea, SIN NUBE.
//
// Copia deliberada de plataforma/src/lib/print-routing.ts. Son dos
// entregables separados —este .exe se instala en cada local y se actualiza
// solo; aquel se despliega con el panel— y no hay paquete compartido entre
// ellos. El agente ya duplica el armado de tickets por lo mismo.
//
// El costo de la copia se acota con UNA regla, y es la que manda aquí:
//
//   CUALQUIER ESTACIÓN QUE NO SE PUEDA RESOLVER CAE EN `kitchenTarget`.
//
// El snapshot puede estar viejo, incompleto o no traer estaciones en
// absoluto (nube anterior a M-07, o migración 130 sin aplicar). En todos
// esos casos sale UN papel por el destino de siempre, que es exactamente
// lo que hacía este agente antes de esta versión. Un snapshot viejo nunca
// pierde un ticket: como mucho, no lo reparte.

import type { MenuSnapshot } from './store.ts';

/** Una parte de la comanda: dónde imprimirla y qué lleva. */
export interface ParteLocal<T> {
  /** Va en grande en la cabecera del papel. */
  nombre: string;
  /** Ya resuelto y no vacío: quien recibe esto solo tiene que imprimir. */
  target: string;
  items: T[];
}

/** Lo único que hace falta saber de una línea para enrutarla. */
export interface LineaLocal {
  /** `null` = artículo sin producto: cae en la principal, como en la nube. */
  productId: string | null;
}

/**
 * Parte una comanda local en un papel por estación con líneas.
 *
 * Devuelve las partes en el orden de `sort_order`, solo las que tienen
 * líneas, y siempre con un `target` utilizable. Una lista vacía significa
 * que este local no tiene a dónde imprimir nada.
 */
export function repartirComandaLocal<T extends LineaLocal>(
  items: readonly T[],
  snapshot: MenuSnapshot,
  kitchenTarget: string | null,
): ParteLocal<T>[] {
  const deSiempre = kitchenTarget?.trim() || null;
  const todo = (): ParteLocal<T>[] =>
    deSiempre && items.length > 0 ? [{ nombre: 'Cocina', target: deSiempre, items: [...items] }] : [];

  const estaciones = (snapshot.stations ?? [])
    .filter((e) => e && typeof e.id === 'string')
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  if (estaciones.length === 0 || items.length === 0) return todo();

  // El refugio: la principal si imprime, si no la primera que imprima, y
  // si ninguna imprime el destino de siempre. Sin refugio no se reparte —
  // se manda todo por el camino de antes, que es mejor que perder líneas.
  const principal = estaciones.find((e) => e.is_default) ?? estaciones[0];
  const refugioTarget =
    principal.target?.trim() ||
    estaciones.find((e) => e.target?.trim())?.target?.trim() ||
    deSiempre;
  if (!refugioTarget) return todo();

  const refugio = { id: principal.id, nombre: principal.name, target: refugioTarget };

  // producto → estación, resuelto igual que en la nube:
  //   producto.station_id ?? categoría.station_id ?? la principal
  const porCategoria = new Map<string, string>();
  for (const c of snapshot.categories ?? []) {
    if (c.station_id) porCategoria.set(c.id, c.station_id);
  }
  const porProducto = new Map<string, string>();
  for (const p of snapshot.products ?? []) {
    const id = p.station_id ?? (p.category_id ? porCategoria.get(p.category_id) : undefined);
    if (id) porProducto.set(p.id, id);
  }
  const porId = new Map(estaciones.map((e) => [e.id, e]));

  const destino = (item: T): { id: string; nombre: string; target: string } => {
    const estacionId = item.productId ? porProducto.get(item.productId) : undefined;
    const estacion = estacionId ? porId.get(estacionId) : undefined;
    // Sin producto, sin mapear, o apuntando a una estación que este
    // snapshot no conoce: al refugio.
    if (!estacion) return refugio;
    const target = estacion.target?.trim();
    // Estación declarada pero sin impresora: al refugio, que sí imprime.
    if (!target) return refugio;
    return { id: estacion.id, nombre: estacion.name, target };
  };

  const porEstacion = new Map<string, ParteLocal<T>>();
  for (const item of items) {
    const d = destino(item);
    const parte = porEstacion.get(d.id);
    if (parte) parte.items.push(item);
    else porEstacion.set(d.id, { nombre: d.nombre, target: d.target, items: [item] });
  }

  // El orden de los papeles es el de `sort_order`, como en la nube: quien
  // recoge en el pase encuentra siempre los mismos primero.
  const orden = [...porEstacion.keys()].sort(
    (a, b) => (porId.get(a)?.sort_order ?? 0) - (porId.get(b)?.sort_order ?? 0),
  );
  return orden.map((id) => porEstacion.get(id)!);
}
