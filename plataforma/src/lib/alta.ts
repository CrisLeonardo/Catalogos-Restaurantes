/* ============================================================
   ALTA HASTA EL PRIMER VALOR (ficha 2.3 de la auditoría integral)
   ------------------------------------------------------------
   Maqueta aprobada: docs/diseno/MAQUETA_ALTA_PRIMER_VALOR_2026-11-16.html

   El alta pregunta lo que hace falta para que la carta sirva —el
   nombre, cómo le piden y qué vende— y de ahí sugiere el plan y los
   modos de pedido. Reglas puras, con pruebas en alta.test.ts.
   ============================================================ */

export type ComoTePiden = 'carta' | 'llevar' | 'mesas';
export type PlanAlta = 'BASICO' | 'EN_LINEA' | 'ESTANDAR' | 'PREMIUM';
export type ModoPedido = 'dine_in' | 'pickup' | 'delivery';

/** Solo ven la carta → Básico; para llevar y a domicilio → En línea;
    mesas con meseros → Premium. Estándar se elige a mano. */
export function planSugerido(como: ComoTePiden): PlanAlta {
  return como === 'carta' ? 'BASICO' : como === 'llevar' ? 'EN_LINEA' : 'PREMIUM';
}

/** Los dos modos de Estándar según cómo le piden. */
export function modosEstandar(como: ComoTePiden): ModoPedido[] {
  return como === 'llevar' ? ['pickup', 'delivery'] : ['dine_in', 'pickup'];
}

export interface PlatoAlta { nombre: string; precio: number }

/** Los platillos del alta: hasta 20, nombre de 2 a 120 letras y precio > 0.
    Las filas vacías se ignoran; una a medias se rechaza con su motivo. */
export function leerPlatosDelAlta(raw: unknown): { lista: PlatoAlta[] } | { error: string } {
  if (typeof raw !== 'string' || !raw.trim()) return { lista: [] };
  let filas: unknown;
  try { filas = JSON.parse(raw); } catch { return { error: 'No pudimos leer tus platillos. Vuelve a escribirlos.' }; }
  if (!Array.isArray(filas)) return { lista: [] };
  const lista: PlatoAlta[] = [];
  for (const f of filas.slice(0, 20)) {
    const nombre = String((f as { nombre?: unknown } | null)?.nombre ?? '').trim().slice(0, 120);
    const precioTxt = String((f as { precio?: unknown } | null)?.precio ?? '').replace(',', '.').trim();
    if (!nombre && !precioTxt) continue;
    if (nombre.length < 2) return { error: 'A un platillo le falta el nombre.' };
    const precio = Math.round(Number(precioTxt) * 100) / 100;
    if (!precioTxt || !Number.isFinite(precio) || precio <= 0 || precio > 100000) {
      return { error: `Revisa el precio de «${nombre}».` };
    }
    lista.push({ nombre, precio });
  }
  return { lista };
}
