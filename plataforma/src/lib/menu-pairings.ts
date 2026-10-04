/* ============================================================
   «ACOMPÁÑALO CON…» — QUÉ SUGERIR JUNTO A UN PLATILLO
   ------------------------------------------------------------
   La palanca de venta más barata de un menú digital es ofrecer la
   bebida o el postre en el momento en que el comensal ya decidió
   (auditoría 2026-10-02, CAT-13). Para que funcione sin pedirle al
   dueño que arme sugerencias platillo por platillo, la regla sale
   de su propia carta: el NOMBRE de cada categoría dice si es de
   bebidas, de acompañamientos o de postres («Café», «Fríos»,
   «Dulce», «Extras»…). Lo demás es plato principal.

     · A un plato principal se le ofrece lo que falta: bebida,
       acompañamiento y postre (uno de cada uno, hasta tres).
     · A una bebida, postre o acompañamiento; a un postre, bebida…
       nunca más de lo mismo.
     · En el carrito, lo que todavía no lleva: si ya hay bebida, no
       se le ofrece otra.

   Solo se sugiere lo que se agrega de un toque (sin opciones que
   elegir), lo que se puede pedir ahora mismo (no agotado, su
   categoría en horario) y lo que no está ya en el pedido. Dentro de
   cada tipo van primero los marcados como favoritos.

   Sin base de datos ni React: se prueba en menu-pairings.test.ts.
   ============================================================ */

import { fold, hasWord } from '@/lib/category-icon';
import { isUnavailable, type AvailabilityFields } from '@/lib/product-availability';

export type TipoAcompanante = 'bebida' | 'guarnicion' | 'postre';

/** Orden en que se ofrecen: lo que más se suele añadir, primero. */
const ORDEN: TipoAcompanante[] = ['bebida', 'guarnicion', 'postre'];

/* El postre va antes que la bebida: «Café y postres» o «Pan dulce» son
   de postre; «Café» a secas, de bebida. */
const PALABRAS: [TipoAcompanante, string[]][] = [
  ['postre', ['postre', 'dessert', 'pastel', 'dulce', 'sweet', 'helado', 'reposteria', 'galleta', 'crepa', 'waffle', 'flan', 'brownie', 'pan dulce']],
  ['bebida', ['bebida', 'drink', 'refresco', 'jugo', 'licuado', 'batido', 'malteada', 'smoothie', 'frappe', 'cafe', 'coffee', 'te', 'agua', 'soda', 'gaseosa', 'limonada', 'horchata', 'cerveza', 'beer', 'vino', 'wine', 'coctel', 'cocktail', 'trago', 'frio']],
  ['guarnicion', ['acompanamiento', 'acompanante', 'complemento', 'guarnicion', 'extra', 'side', 'adicional', 'papas']],
];

/** Qué tipo de acompañante es una categoría, por su nombre (null = plato principal). */
export function tipoDeCategoria(nombre: string): TipoAcompanante | null {
  const n = fold(nombre);
  for (const [tipo, palabras] of PALABRAS) {
    if (palabras.some((p) => hasWord(n, p))) return tipo;
  }
  return null;
}

/* Etiquetas que el dueño escribe a mano para sus platillos estrella. */
const DESTACADO = new Set(['fav', 'favorito', 'favorita', 'favorite', 'destacado', 'destacada', 'estrella', 'star']);

/** ¿Lleva una etiqueta de favorito/destacado? (Mismo criterio que la carta.) */
export function esDestacado(tags: string[] | null | undefined): boolean {
  return (tags ?? []).some((t) => DESTACADO.has(fold(t.trim())));
}

export interface ProductoSugerible extends AvailabilityFields {
  id: string;
  category_id: string | null;
  tags?: string[] | null;
  options?: { choices?: unknown[] | null }[] | null;
}

/** ¿Se agrega de un toque, sin elegir nada? */
export function deUnToque(p: Pick<ProductoSugerible, 'options'>): boolean {
  return !(Array.isArray(p.options) && p.options.some((g) => (g.choices?.length ?? 0) > 0));
}

export function sugerirAcompanantes<P extends ProductoSugerible>({
  productos,
  categorias,
  base,
  categoriaAbierta = () => true,
  max = 3,
  now = Date.now(),
}: {
  productos: P[];
  categorias: { id: string; name: string }[];
  /** Lo que ya se lleva: el platillo abierto, o lo que hay en el carrito. */
  base: string[];
  /** ¿La categoría se puede pedir ahora? (menús con horario). */
  categoriaAbierta?: (categoryId: string) => boolean;
  max?: number;
  now?: number;
}): P[] {
  if (base.length === 0 || max <= 0) return [];

  const tipoPorCategoria = new Map(categorias.map((c) => [c.id, tipoDeCategoria(c.name)]));
  const tipoDe = (p: Pick<P, 'category_id'>) => (p.category_id ? tipoPorCategoria.get(p.category_id) ?? null : null);

  const enBase = new Set(base);
  const yaLleva = new Set<TipoAcompanante | 'principal'>();
  for (const p of productos) {
    if (enBase.has(p.id)) yaLleva.add(tipoDe(p) ?? 'principal');
  }
  // Nada de la carta en la base (p. ej. un platillo que se borró): no hay contexto.
  if (yaLleva.size === 0) return [];

  const faltan = ORDEN.filter((t) => !yaLleva.has(t));
  const candidatos = faltan.map((tipo) => productos
    .filter((p) => tipoDe(p) === tipo
      && !enBase.has(p.id)
      && deUnToque(p)
      && !isUnavailable(p, now)
      && (!p.category_id || categoriaAbierta(p.category_id)))
    // `sort` es estable: entre iguales se respeta el orden de la carta.
    .sort((a, b) => Number(esDestacado(b.tags)) - Number(esDestacado(a.tags))));

  // Uno de cada tipo, por turnos, hasta llenar.
  const out: P[] = [];
  for (let ronda = 0; out.length < max; ronda++) {
    let alguno = false;
    for (const lista of candidatos) {
      if (ronda < lista.length) {
        alguno = true;
        out.push(lista[ronda]);
        if (out.length >= max) break;
      }
    }
    if (!alguno) break;
  }
  return out;
}

/**
 * «Lo más pedido», para el checkout con el carrito vacío (CAT-09): lo que
 * más se vendió primero (`topIds`, de más a menos), luego los favoritos y
 * luego el orden de la carta. Con la misma criba que las sugerencias: de
 * un toque, disponible y con su categoría en horario.
 */
export function masPedidos<P extends ProductoSugerible>({
  productos,
  topIds,
  categoriaAbierta = () => true,
  max = 4,
  now = Date.now(),
}: {
  productos: P[];
  topIds: string[];
  categoriaAbierta?: (categoryId: string) => boolean;
  max?: number;
  now?: number;
}): P[] {
  const puesto = new Map(topIds.map((id, i) => [id, i]));
  const rango = (p: P) => puesto.get(p.id) ?? (esDestacado(p.tags) ? topIds.length : topIds.length + 1);
  return productos
    .filter((p) => deUnToque(p) && !isUnavailable(p, now) && (!p.category_id || categoriaAbierta(p.category_id)))
    .sort((a, b) => rango(a) - rango(b))
    .slice(0, Math.max(0, max));
}
