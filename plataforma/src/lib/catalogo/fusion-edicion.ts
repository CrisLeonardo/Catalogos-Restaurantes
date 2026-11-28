/* ============================================================
   GUARDAR SOLO LO QUE SE CAMBIÓ EN LA FICHA DE UN PLATILLO
   ------------------------------------------------------------
   Auditoría del 26-nov-2026, hallazgo 2. La ficha mandaba TODOS sus
   campos al guardar. Si alguien abría «Editar Limonada» con la limonada
   agotada, otra persona la reactivaba desde la lista y la primera
   guardaba solo un precio nuevo, la limonada volvía a quedar agotada:
   la ficha vieja reescribía la disponibilidad que tenía cuando se abrió.

   Ahora la ficha manda también cómo estaba cada campo al abrirla (la
   «base»). El servidor compara tres versiones de cada campo:

     · base     — cómo estaba al abrir la ficha;
     · enviado  — lo que la persona deja al guardar;
     · actual   — lo que hay en la base de datos en este momento.

   Solo se escribe lo que la persona cambió (enviado ≠ base). Si otra
   persona cambió ESE MISMO campo mientras tanto (actual ≠ base) y lo dejó
   distinto, es un conflicto: no se guarda nada y se pregunta. Lo que
   cambió otra persona en campos que esta no tocó se conserva.

   Sin base de datos a propósito: se prueba entero en fusion-edicion.test.ts.
   ============================================================ */

import { separarSellos } from './reglas';

export const CAMPOS_FICHA = {
  categoria: 'la categoría',
  nombre: 'el nombre',
  descripcion: 'la descripción',
  nombreEn: 'el nombre en inglés',
  descripcionEn: 'la descripción en inglés',
  precio: 'el precio',
  costo: 'el costo',
  puntos: 'los puntos',
  foto: 'la foto',
  icono: 'el ícono',
  sellos: 'los sellos y dietas',
  opciones: 'las opciones',
  visible: 'si se muestra en el menú',
  disponibilidad: 'la disponibilidad',
} as const;

export type CampoFicha = keyof typeof CAMPOS_FICHA;
export type FichaCanonica = Record<CampoFicha, string>;

type Lector = (nombre: string) => string | null | undefined;

const fold = (t: string) => t.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
const texto = (v: string | null | undefined) => (v ?? '').trim();
const lista = (raw: string | null | undefined) => (raw ?? '').split(',').map((t) => t.trim()).filter(Boolean);

function numero(v: string | null | undefined, decimales: number): string {
  const s = texto(v);
  if (!s) return '';
  const n = Number(s);
  return Number.isFinite(n) ? n.toFixed(decimales) : s;
}

/** Las opciones sin ids ni orden de llaves: lo que el comensal ve. */
function opcionesCanonicas(raw: string | null | undefined): string {
  let data: unknown;
  try { data = JSON.parse(texto(raw) || '[]'); } catch { return texto(raw); }
  if (!Array.isArray(data)) return '[]';
  const grupos = (data as Record<string, unknown>[])
    .map((g) => ({
      n: texto(String(g?.name ?? '')),
      t: g?.type === 'multi' || g?.type === 'combo' ? g.type : 'single',
      r: g?.required === true,
      max: Number(g?.max) || 0,
      min: Number(g?.min) || 0,
      c: (Array.isArray(g?.choices) ? g.choices as Record<string, unknown>[] : [])
        .map((c) => ({
          n: texto(String(c?.name ?? '')),
          p: Number(c?.priceDelta) || 0,
          v: (Array.isArray(c?.variants) ? c.variants as Record<string, unknown>[] : [])
            .map((v) => ({ n: texto(String(v?.name ?? '')), p: Number(v?.priceDelta) || 0 }))
            .filter((v) => v.n),
        }))
        .filter((c) => c.n),
    }))
    .filter((g) => g.n && g.c.length > 0);
  return JSON.stringify(grupos);
}

function disponibilidad(disponible: string | null | undefined, hasta: string | null | undefined): string {
  if (disponible !== 'false') return 'disponible';
  const h = hasta === 'reponer' || hasta === 'manual' || hasta === 'manana' ? hasta : 'manana';
  return `agotado:${h}`;
}

/** Cada campo de la ficha en una forma comparable, a partir de lo que manda el formulario. */
export function canonicoDeFormulario(get: Lector): FichaCanonica {
  const marcas = separarSellos(lista(get('tags')), lista(get('dietary_tags')));
  return {
    categoria: texto(get('category_id')),
    nombre: texto(get('name')),
    descripcion: texto(get('description')),
    nombreEn: texto(get('name_en')),
    descripcionEn: texto(get('description_en')),
    precio: numero(get('price'), 2),
    costo: numero(get('cost'), 4),
    puntos: numero(get('loyalty_points'), 0),
    foto: texto(get('image_url')),
    icono: texto(get('icon')),
    sellos: [...marcas.sellos.map((s) => `s:${fold(s)}`), ...marcas.dietas.map((d) => `d:${d}`)].sort().join('|'),
    opciones: opcionesCanonicas(get('options')),
    visible: get('is_active') === 'false' ? 'no' : 'si',
    disponibilidad: disponibilidad(get('is_available'), get('agotado_hasta')),
  };
}

export interface FilaPlatillo {
  category_id?: string | null;
  name?: string | null;
  description?: string | null;
  name_en?: string | null;
  description_en?: string | null;
  price?: number | string | null;
  cost?: number | string | null;
  loyalty_points?: number | null;
  image_url?: string | null;
  icon?: string | null;
  tags?: string[] | null;
  dietary_tags?: string[] | null;
  options?: unknown;
  is_active?: boolean | null;
  is_available?: boolean | null;
  agotado_motivo?: string | null;
}

/** La fila de la base, leída como si la mandara el formulario. */
export function canonicoDeFila(f: FilaPlatillo): FichaCanonica {
  const valores: Record<string, string> = {
    category_id: f.category_id ?? '',
    name: f.name ?? '',
    description: f.description ?? '',
    name_en: f.name_en ?? '',
    description_en: f.description_en ?? '',
    price: f.price == null ? '' : String(f.price),
    cost: f.cost == null ? '' : String(f.cost),
    loyalty_points: f.loyalty_points == null ? '' : String(f.loyalty_points),
    image_url: f.image_url ?? '',
    icon: f.icon ?? '',
    tags: (f.tags ?? []).join(','),
    dietary_tags: (f.dietary_tags ?? []).join(','),
    options: JSON.stringify(Array.isArray(f.options) ? f.options : []),
    is_active: f.is_active === false ? 'false' : 'true',
    is_available: f.is_available === false ? 'false' : 'true',
    agotado_hasta: f.agotado_motivo ?? '',
  };
  return canonicoDeFormulario((k) => valores[k]);
}

/** La base que manda la ficha: un objeto plano nombre → valor. */
export function leerBase(raw: unknown): FichaCanonica | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return null; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const obj = data as Record<string, unknown>;
  return canonicoDeFormulario((k) => (typeof obj[k] === 'string' ? obj[k] as string : null));
}

export interface Fusion {
  /** Lo que esta persona cambió y se va a escribir. */
  cambiados: CampoFicha[];
  /** Lo que cambió también otra persona, a un valor distinto. */
  conflictos: CampoFicha[];
}

export function fusionarEdicion(base: FichaCanonica | null, enviado: FichaCanonica, actual: FichaCanonica): Fusion {
  const campos = Object.keys(CAMPOS_FICHA) as CampoFicha[];
  // Sin base (una ficha abierta antes de este cambio): se guarda todo, como antes.
  if (!base) return { cambiados: campos, conflictos: [] };
  const cambiados = campos.filter((c) => enviado[c] !== base[c]);
  const conflictos = cambiados.filter((c) => actual[c] !== base[c] && actual[c] !== enviado[c]);
  return { cambiados, conflictos };
}

/** «el precio y la disponibilidad». */
export function nombrarCampos(campos: CampoFicha[]): string {
  const n = campos.map((c) => CAMPOS_FICHA[c]);
  if (n.length <= 1) return n[0] ?? '';
  return `${n.slice(0, -1).join(', ')} y ${n[n.length - 1]}`;
}
