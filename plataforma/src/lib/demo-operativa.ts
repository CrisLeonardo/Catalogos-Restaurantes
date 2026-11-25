/* ============================================================
   DEMO POR CASO: MOSTRADOR Y MESAS
   ------------------------------------------------------------
   Maqueta aprobada: docs/diseno/MAQUETA_DEMO_POR_CASO_Y_CUPO_2026-11-25.html §1.

   Quien compara Estándar quiere ver tomar el pedido, cobrar y cerrar
   caja. Quien compara Premium quiere ver la mesa: comanda con nota,
   cocina, dividir la cuenta y liberar la mesa. Hasta 2026-11-25 las dos
   demos abrían la misma carta del comensal.

   Todo pasa en la memoria del navegador: no hay base, pedido ni caja.
   Aquí vive solo lo que se puede probar sin pantalla: los pasos, el
   cambio, el reparto en partes iguales y qué platillos se enseñan.
   La pantalla está en `components/pidelo/demo-operativa.tsx`.
   ============================================================ */

export type CasoDemo = 'mostrador' | 'mesas';

export const PASOS: Record<CasoDemo, readonly string[]> = {
  mostrador: ['Tomar el pedido', 'Cobrar y dar cambio', 'Cocina lo prepara', 'Cerrar caja'],
  mesas: ['Abrir la mesa', 'Tomar la comanda', 'Cocina lo prepara', 'Servir', 'Dividir la cuenta', 'Liberar la mesa'],
};

/** Fondo con el que abre la caja de la demo. */
export const FONDO_DEMO = 100;

export function casoDemo(valor: unknown): CasoDemo | null {
  return valor === 'mostrador' || valor === 'mesas' ? valor : null;
}

const centavos = (n: number) => Math.round(n * 100);

/** El cambio de un pago en efectivo, o null si no alcanza. */
export function cambio(total: number, recibido: number): number | null {
  const c = centavos(recibido) - centavos(total);
  return c < 0 ? null : c / 100;
}

/** Billetes que tiene sentido ofrecer para pagar `total`: el exacto, el
    siguiente múltiplo de 5 y de 10, y Q100/Q200 si alcanzan. */
export function billetesSugeridos(total: number): number[] {
  const t = Math.ceil(total);
  const opciones = [total, Math.ceil(t / 5) * 5, Math.ceil(t / 10) * 10, 50, 100, 200]
    .filter((n) => n >= total);
  return [...new Set(opciones.map((n) => centavos(n) / 100))].sort((a, b) => a - b).slice(0, 4);
}

/** `total` en `n` partes que suman exacto: el centavo que sobra va a las
    primeras. Q70 entre 3 → 23.34, 23.33, 23.33 (el caso de la auditoría). */
export function partesIguales(total: number, n: number): number[] {
  const partes = Math.max(1, Math.trunc(n));
  const c = centavos(total);
  const base = Math.floor(c / partes);
  const sobra = c - base * partes;
  return Array.from({ length: partes }, (_, i) => (base + (i < sobra ? 1 : 0)) / 100);
}

export interface PlatoDemo { id: string; nombre: string; precio: number }

/** Los platillos preferidos de Rincón 502 para la demo (los de la auditoría
    y la maqueta). Si la carta cambia, se completan con los primeros que haya. */
const PREFERIDOS = ['Rincón Clásica', 'Limonada con Menta', 'Doble Bacon', 'Café Americano', 'Papas a la Francesa con Queso', 'Tres Leches'];

export function platosDeDemo(
  productos: { id: string; name: string; price: number; is_available?: boolean | null }[],
  cuantos = 6,
): PlatoDemo[] {
  const disponibles = productos.filter((p) => p.is_available !== false && Number(p.price) > 0);
  const norm = (s: string) => s.trim().toLowerCase();
  const elegidos: typeof disponibles = [];
  for (const nombre of PREFERIDOS) {
    const p = disponibles.find((x) => norm(x.name) === norm(nombre));
    if (p) elegidos.push(p);
  }
  for (const p of disponibles) {
    if (elegidos.length >= cuantos) break;
    if (!elegidos.includes(p)) elegidos.push(p);
  }
  return elegidos.slice(0, cuantos).map((p) => ({ id: p.id, nombre: p.name, precio: Number(p.price) }));
}
