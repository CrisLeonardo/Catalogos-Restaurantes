/* ============================================================
   BÚSQUEDA POR ANTOJO (auditoría «La carta que vende», CV-34)
   ------------------------------------------------------------
   Al tocar la lupa, atajos que responden «¿qué pido?» y no solo
   «¿dónde está la limonada?»: «Para compartir», «Menos de Q50»,
   «Sin carne», «Picante». Salen de lo que la carta ya sabe
   (etiquetas, dietas y precio); nada que el dueño tenga que llenar.
   Un atajo solo aparece si sirve: con al menos un platillo y sin
   abarcar la carta entera.
   ============================================================ */

export type AntojoId = 'compartir' | 'barato' | 'sin_carne' | 'picante';

export interface Antojo { id: AntojoId; label: string; labelEn: string }

interface P {
  name: string;
  price: number;
  tags?: string[] | null;
  dietary_tags?: string[] | null;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const PARA_COMPARTIR = /\b(compartir|nachos|alitas|tabla|familiar|combo|picada|para dos|2 personas)\b/;

/** Umbral de «Menos de Q…»: la mediana de la carta, redondeada hacia abajo a 5. */
export function umbralBarato(productos: readonly P[]): number | null {
  const precios = productos.map((p) => Number(p.price)).filter((n) => n > 0).sort((a, b) => a - b);
  if (precios.length < 4) return null;
  const mediana = precios[Math.floor(precios.length / 2)];
  const u = Math.floor(mediana / 5) * 5;
  return u > 0 ? u : null;
}

export function coincideAntojo(p: P, id: AntojoId, umbral: number | null): boolean {
  const tags = (p.tags ?? []).map(fold);
  const dietas = p.dietary_tags ?? [];
  switch (id) {
    case 'compartir': return tags.some((t) => t.includes('compartir')) || PARA_COMPARTIR.test(fold(p.name));
    case 'barato': return umbral !== null && Number(p.price) > 0 && Number(p.price) < umbral;
    case 'sin_carne': return dietas.includes('vegetariano') || dietas.includes('vegano');
    case 'picante': return dietas.includes('picante') || tags.some((t) => t === 'hot' || t === 'picante');
  }
}

export function antojosDisponibles(productos: readonly P[], simbolo: string): Array<Antojo & { umbral: number | null }> {
  const umbral = umbralBarato(productos);
  const todos: Array<Antojo & { umbral: number | null }> = [
    { id: 'compartir', label: 'Para compartir', labelEn: 'To share', umbral },
    { id: 'barato', label: `Menos de ${simbolo}${umbral ?? ''}`, labelEn: `Under ${simbolo}${umbral ?? ''}`, umbral },
    { id: 'sin_carne', label: 'Sin carne', labelEn: 'Meat-free', umbral },
    { id: 'picante', label: 'Picante', labelEn: 'Spicy', umbral },
  ];
  return todos.filter((a) => {
    const n = productos.filter((p) => coincideAntojo(p, a.id, umbral)).length;
    return n > 0 && n < productos.length;
  });
}
