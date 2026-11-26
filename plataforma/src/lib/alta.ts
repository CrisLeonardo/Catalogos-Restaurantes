/* ============================================================
   ALTA HASTA EL PRIMER VALOR (ficha 2.3 de la auditoría integral)
   ------------------------------------------------------------
   Maqueta aprobada: docs/diseno/MAQUETA_ALTA_PRIMER_VALOR_2026-11-16.html

   El alta pregunta lo que hace falta para que la carta sirva —el
   nombre, cómo le piden y qué vende— y de ahí sugiere el plan y los
   modos de pedido. Reglas puras, con pruebas en alta.test.ts.
   ============================================================ */

/* Las MISMAS cuatro respuestas que la web (Planes y la portada). Antes el
   alta tenía tres y quien eligió «En mostrador» en Planes no encontraba su
   caso: con «mesas» le proponía Premium y con «para llevar», En línea
   (auditoría de lanzamiento 2026-11-23, LZ-11; maqueta
   docs/diseno/MAQUETA_ALTA_CON_PLAN_2026-11-23.html). */
export type ComoTePiden = 'carta' | 'llevar' | 'mostrador' | 'mesas';
export type PlanAlta = 'BASICO' | 'EN_LINEA' | 'ESTANDAR' | 'PREMIUM';
export type ModoPedido = 'dine_in' | 'pickup' | 'delivery';

const COMOS: ComoTePiden[] = ['carta', 'llevar', 'mostrador', 'mesas'];
const PLANES_ALTA: PlanAlta[] = ['BASICO', 'EN_LINEA', 'ESTANDAR', 'PREMIUM'];

/** Solo ven la carta → Básico; para llevar y a domicilio → En línea;
    en mostrador → Estándar; mesas con meseros → Premium. */
export function planSugerido(como: ComoTePiden): PlanAlta {
  if (como === 'carta') return 'BASICO';
  if (como === 'llevar') return 'EN_LINEA';
  if (como === 'mostrador') return 'ESTANDAR';
  return 'PREMIUM';
}

/** Los casos de la web pública son los mismos del alta. */
export type CasoDeLaWeb = ComoTePiden;

/** El plan para un caso de la web. Para llevar con más de 300 pedidos al
    mes pasa a Estándar: En línea los deja pasar (límite blando), pero
    Estándar no tiene tope y trae reportes. */
export function planParaTuCaso(caso: CasoDeLaWeb, masDe300 = false): PlanAlta {
  if (caso === 'llevar' && masDe300) return 'ESTANDAR';
  return planSugerido(caso);
}

/** Lo que eligió en la web y viaja hasta el alta. */
export interface IntencionAlta { plan: PlanAlta; caso: ComoTePiden }

/**
 * Lee el plan y el caso que llegan por el enlace (o guardados en la cuenta)
 * sin confiar en ellos: cualquier valor fuera de lista se ignora. Con solo
 * el caso, el plan sale de la regla de la web; con solo el plan, del caso
 * que lo sugiere.
 */
export function leerIntencion(plan: unknown, caso: unknown): IntencionAlta | null {
  const c = typeof caso === 'string' && (COMOS as string[]).includes(caso) ? caso as ComoTePiden : null;
  const p = typeof plan === 'string' && (PLANES_ALTA as string[]).includes(plan) ? plan as PlanAlta : null;
  if (c && p) return { plan: p, caso: c };
  if (c) return { plan: planSugerido(c), caso: c };
  if (p) return { plan: p, caso: COMOS.find((x) => planSugerido(x) === p) ?? 'carta' };
  return null;
}

/** La dirección del registro con lo que eligió en la web. */
export function enlaceDeAlta(intencion: IntencionAlta | null, base = '/registro'): string {
  if (!intencion) return base;
  const q = new URLSearchParams({ plan: intencion.plan, caso: intencion.caso });
  return `${base}?${q.toString()}`;
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
