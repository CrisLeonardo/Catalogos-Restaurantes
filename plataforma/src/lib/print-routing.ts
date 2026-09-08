/**
 * A qué impresora va cada línea de una comanda.
 * ------------------------------------------------------------
 * Fase 2 de M-07. `lib/db/print-stations.ts` averigua el mapa —qué
 * estación le toca a cada producto— y esto lo aplica: parte la comanda en
 * un papel por estación con líneas.
 *
 * Es una función pura, sin base de datos y sin React, por el mismo motivo
 * que `lib/table-payments.ts`: lo que decide aquí es qué se cocina y
 * dónde, y eso tiene que poder escribirse como prueba.
 *
 * ── LA REGLA QUE MANDA SOBRE TODAS ─────────────────────────────
 *
 * **Ninguna línea se pierde.** Un plato que no sale por ninguna impresora
 * es un plato que no se cocina y que el cliente sí va a esperar. Así que
 * cada caso raro —una estación que ya no existe, una sin impresora
 * asignada, un local que se quedó sin estación por defecto— termina
 * mandando la línea a algún papel, nunca al suelo. Las pruebas de este
 * archivo son, casi todas, un plato que podría haberse perdido.
 *
 * (Vive en `print-routing.ts` y no en `printing/routing.ts` como decía el
 * plan: `lib/printing.ts` ya existe, y una carpeta con el mismo nombre al
 * lado es una trampa de resolución esperando a alguien.)
 */
import type { MapaDeEstaciones, PrintStation } from '@/lib/db/print-stations';

/** Lo único que esta función necesita saber de una línea. El resto —el
    nombre, la cantidad, las opciones, la nota— es cosa del ticket. */
export interface LineaEnrutable {
  /** `null` en un ARTÍCULO LIBRE (un descorche no tiene producto contra el
      que resolver nada) y en un producto que ya se borró del menú
      (`order_items.product_id` es `on delete set null`). */
  product_id?: string | null;
}

/** Un papel: una estación y las líneas que le tocan. */
export interface ParteDeComanda<T> {
  estacion: PrintStation;
  items: T[];
}

/**
 * Reparte las líneas de una comanda entre las estaciones del local.
 *
 * Devuelve **solo las estaciones con líneas**, ordenadas por `sort_order`
 * — para que los papeles salgan siempre en el mismo orden y quien recoge
 * en el pase encuentre siempre los mismos primero. Una mesa que pidió
 * solo comida no produce papel de barra.
 *
 * Si todo cae en una sola estación devuelve UNA parte, que es el caso
 * normal de un local que todavía no ha mapeado nada: un ticket idéntico
 * al de siempre.
 *
 * Una lista vacía significa «aquí no hay nada que imprimir por
 * estaciones» —ni líneas, ni estaciones— y quien llama debe seguir por el
 * camino de siempre: un papel al destino de `print_agents`.
 */
export function repartirPorEstacion<T extends LineaEnrutable>(
  items: readonly T[],
  mapa: MapaDeEstaciones,
): ParteDeComanda<T>[] {
  if (items.length === 0 || mapa.estaciones.length === 0) return [];

  const porId = new Map(mapa.estaciones.map((e) => [e.id, e]));

  /* La red de seguridad, en orden: la marcada por defecto; si el local se
     quedó sin ninguna —el índice único impide DOS, no impide CERO—, la
     primera por `sort_order`. Nunca `undefined`: si llegamos aquí hay al
     menos una estación, y perder líneas no es una opción. */
  const refugio = mapa.porDefecto ?? mapa.estaciones[0];

  const destino = (item: T): PrintStation => {
    const id = item.product_id ? mapa.porProducto[item.product_id] : undefined;
    // Sin producto (artículo libre), sin mapear, o apuntando a una
    // estación que ya no está: al refugio.
    const estacion = id ? porId.get(id) : undefined;
    if (!estacion) return refugio;

    /* Estación declarada pero SIN IMPRESORA todavía. Encolar contra un
       destino vacío es exactamente cómo se pierde una cerveza: el papel
       no sale y nadie lo echa en falta. Va al refugio, que al menos tiene
       gente delante. Si el refugio tampoco tiene impresora, se queda
       igualmente ahí: eso ya es «este local no tiene impresora», que es
       un problema anterior a las estaciones y que se avisa como siempre. */
    if (!estacion.target && refugio.target) return refugio;

    return estacion;
  };

  const porEstacion = new Map<string, T[]>();
  for (const item of items) {
    const est = destino(item);
    const lista = porEstacion.get(est.id);
    if (lista) lista.push(item);
    else porEstacion.set(est.id, [item]);
  }

  // El orden de las PARTES lo manda `sort_order`; el orden de las líneas
  // DENTRO de cada parte es el de la comanda, que es como se cantó.
  return mapa.estaciones
    .filter((e) => porEstacion.has(e.id))
    .map((estacion) => ({ estacion, items: porEstacion.get(estacion.id)! }));
}

/**
 * Cómo se numera un papel en su cabecera: «Parte 2 de 3».
 *
 * Devuelve `null` cuando solo hay un papel — que es el caso de casi todos
 * los locales, y donde la coletilla sería ruido en un ticket de 80 mm.
 * El cocinero no necesita saber qué hay en los otros papeles; quien
 * encuentra un ticket suelto en el suelo, sí.
 */
export function etiquetaDeParte(indice: number, total: number): string | null {
  if (total <= 1) return null;
  return `Parte ${indice + 1} de ${total}`;
}
