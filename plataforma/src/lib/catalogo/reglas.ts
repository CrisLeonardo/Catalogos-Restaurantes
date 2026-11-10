/* ============================================================
   CATÁLOGO · reglas puras (auditoría 1.9: R06, R07, M03, E10, N17)
   ------------------------------------------------------------
   Sin servidor: las usan el formulario, la lista y las acciones. Lo que
   decide de verdad (lote, borrar categoría, candado de categoría) está en
   la migración 179; aquí se valida antes de enviar y se dibuja la vista
   previa con la misma aritmética.
   ============================================================ */

import { DIETARY_TAG_OPTIONS } from '@/lib/dietary-tags';
import type { ProductOptionGroup } from '@/types';

/* ── Precio ─────────────────────────────────────────────────────────── */

export const PRECIO_MAXIMO = 1_000_000;

/** Precio en quetzales: ≥ 0, a lo más dos decimales y razonable. */
export function validarPrecio(raw: unknown): { valor: number } | { error: string } {
  const texto = String(raw ?? '').trim().replace(',', '.');
  if (texto === '') return { error: 'Escribe el precio.' };
  if (!/^\d+(\.\d{1,2})?$/.test(texto)) {
    return { error: texto.startsWith('-') ? 'El precio no puede ser negativo.' : 'El precio lleva a lo más dos decimales (ej. 35.50).' };
  }
  const valor = Number(texto);
  if (valor > PRECIO_MAXIMO) return { error: 'Ese precio es demasiado alto.' };
  return { valor };
}

/* ── Sellos y dietas ────────────────────────────────────────────────── */

const normal = (t: string) => t.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const DIETA_POR_NOMBRE = new Map<string, string>([
  ...DIETARY_TAG_OPTIONS.map((o) => [normal(o.label), o.key] as [string, string]),
  // Claves que guardaba el formulario anterior y variantes escritas a mano.
  ['hot', 'picante'], ['veg', 'vegano'], ['veggie', 'vegano'], ['vegana', 'vegano'], ['vegetariana', 'vegetariano'],
]);

/** Mismo criterio que `leogin_dieta_de_sello` (179): «VEGANO» → «vegano». */
export function dietaDeSello(sello: string): string | null {
  return DIETA_POR_NOMBRE.get(normal(sello)) ?? null;
}

/** Un sello que es dieta deja de ser sello y pasa a la dieta (N17, R07.5). */
export function separarSellos(sellos: readonly string[], dietas: readonly string[] = []): { sellos: string[]; dietas: string[] } {
  const quedan: string[] = [];
  const ds = new Set(dietas);
  for (const s of sellos) {
    const limpio = s.trim();
    if (!limpio) continue;
    const d = dietaDeSello(limpio);
    if (d) ds.add(d);
    else if (!quedan.some((q) => normal(q) === normal(limpio))) quedan.push(limpio.slice(0, 30));
  }
  return { sellos: quedan, dietas: [...ds] };
}

/* ── Opciones inequívocas (M03, lado del panel) ─────────────────────── */

/** Lo que falla en un grupo, o null. Mínimo ≤ máximo; la predeterminada existe y no contradice. */
export function problemaDeGrupo(g: ProductOptionGroup): string | null {
  const nombre = g.name || 'Un grupo';
  if (g.type === 'multi') {
    const min = g.min ?? 0;
    const max = g.max ?? 0;
    if (min < 0 || min > 20) return `${nombre}: el mínimo va de 0 a 20.`;
    if (max > 0 && min > max) return `${nombre}: el mínimo (${min}) es mayor que el máximo (${max}).`;
    if (min > g.choices.length) return `${nombre}: pide elegir ${min} pero sólo hay ${g.choices.length} opciones.`;
  }
  if (g.defaultChoiceId != null) {
    if (g.type !== 'single') return `${nombre}: sólo un grupo de «elegir 1» lleva opción predeterminada.`;
    if (!g.choices.some((c) => c.id === g.defaultChoiceId)) return `${nombre}: la opción predeterminada ya no está en el grupo.`;
  }
  return null;
}

/* ── Lote ───────────────────────────────────────────────────────────── */

export type CambioDePrecio = { modo: 'porcentaje' | 'monto'; valor: number };

const centavos = (n: number) => Math.round(n * 100) / 100;

/** Igual que la 179: redondeo a centavos. */
export function precioNuevo(precio: number, c: CambioDePrecio): number {
  return c.modo === 'porcentaje' ? centavos(precio * (1 + c.valor / 100)) : centavos(precio + c.valor);
}

export type FilaPrevia = { id: string; nombre: string; antes: number; despues: number; negativo: boolean };

export function previaDePrecios(productos: readonly { id: string; name: string; price: number }[], c: CambioDePrecio): FilaPrevia[] {
  return productos.map((p) => {
    const despues = precioNuevo(Number(p.price), c);
    return { id: p.id, nombre: p.name, antes: Number(p.price), despues, negativo: despues < 0 };
  });
}

/* ── Filtros y orden del catálogo (R06.2–3) ─────────────────────────── */

export type FiltroCatalogo = 'agotado' | 'oculto' | 'sin_foto' | 'sin_costo' | 'sin_categoria';
export type OrdenCatalogo = 'carta' | 'nombre' | 'edicion';

export const FILTROS: { key: FiltroCatalogo; label: string }[] = [
  { key: 'agotado', label: 'Agotado' },
  { key: 'oculto', label: 'Oculto' },
  { key: 'sin_foto', label: 'Sin foto' },
  { key: 'sin_costo', label: 'Sin costo' },
  { key: 'sin_categoria', label: 'Sin categoría' },
];

type ProductoLista = {
  is_available: boolean; is_active: boolean; image_url: string | null; cost: number | null;
  category_id: string | null; name: string; sort_order: number; updated_at?: string | null;
};

export function cumpleFiltro(p: ProductoLista, f: FiltroCatalogo): boolean {
  switch (f) {
    case 'agotado': return p.is_active && !p.is_available;
    case 'oculto': return !p.is_active;
    case 'sin_foto': return !p.image_url;
    case 'sin_costo': return p.cost == null;
    case 'sin_categoria': return !p.category_id;
  }
}

/** Filtros combinables: el platillo cumple TODOS los activos. */
export function filtrar<T extends ProductoLista>(productos: readonly T[], activos: readonly FiltroCatalogo[]): T[] {
  return productos.filter((p) => activos.every((f) => cumpleFiltro(p, f)));
}

export function contarFiltros(productos: readonly ProductoLista[]): Record<FiltroCatalogo, number> {
  const out = { agotado: 0, oculto: 0, sin_foto: 0, sin_costo: 0, sin_categoria: 0 } as Record<FiltroCatalogo, number>;
  for (const p of productos) for (const f of FILTROS) if (cumpleFiltro(p, f.key)) out[f.key]++;
  return out;
}

export function ordenar<T extends ProductoLista>(
  productos: readonly T[], orden: OrdenCatalogo, ordenCategoria: ReadonlyMap<string, number> = new Map(),
): T[] {
  const copia = [...productos];
  if (orden === 'nombre') return copia.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  if (orden === 'edicion') return copia.sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''));
  // Como en la carta: orden de la categoría, después el del platillo; sin categoría al final.
  const pos = (p: T) => (p.category_id != null ? ordenCategoria.get(p.category_id) ?? 9999 : 10_000);
  return copia.sort((a, b) => pos(a) - pos(b) || a.sort_order - b.sort_order);
}
