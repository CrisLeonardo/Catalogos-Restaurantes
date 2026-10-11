/* ============================================================
   QUÉ CAMBIÓ DE PRECIO
   ------------------------------------------------------------
   PROD-10 (auditoría de salida a producción 2026-10-09): la pregunta
   del dueño cuando la caja no cuadra es «¿quién bajó el precio?», y
   la bitácora no guardaba nada de eso. Esto compara el platillo
   antes y después de guardarlo y devuelve solo los importes que se
   movieron: el precio base y el `priceDelta` de cada opción (y de
   cada variante de un componente de combo).

   Las opciones se emparejan por id, que el editor conserva al
   guardar; una opción nueva o quitada no es un «cambio de precio».
   ============================================================ */

import type { ProductOptionGroup } from '@/types';

export interface CambioDePrecio {
  /** «Tamaño › Grande», «Combo › Bebida › Coca-Cola». */
  que: string;
  antes: number;
  despues: number;
}

export interface PrecioDePlatillo {
  price: number | string | null;
  options: ProductOptionGroup[] | null;
}

export interface CambiosDePrecio {
  /** Precio base, si cambió. */
  precio: { antes: number; despues: number } | null;
  /** Opciones y variantes cuyo importe cambió. */
  opciones: CambioDePrecio[];
}

const centavos = (v: unknown) => Math.round((Number(v) || 0) * 100);

function porId<T extends { id: string }>(lista: T[] | undefined): Map<string, T> {
  return new Map((lista ?? []).map((x) => [x.id, x]));
}

export function cambiosDePrecio(antes: PrecioDePlatillo, despues: PrecioDePlatillo): CambiosDePrecio {
  const precio = centavos(antes.price) !== centavos(despues.price)
    ? { antes: centavos(antes.price) / 100, despues: centavos(despues.price) / 100 }
    : null;

  const opciones: CambioDePrecio[] = [];
  const gruposAntes = porId(antes.options ?? undefined);
  for (const g of despues.options ?? []) {
    const gViejo = gruposAntes.get(g.id);
    if (!gViejo) continue;
    const choicesAntes = porId(gViejo.choices);
    for (const c of g.choices) {
      const cVieja = choicesAntes.get(c.id);
      if (!cVieja) continue;
      if (centavos(cVieja.priceDelta) !== centavos(c.priceDelta)) {
        opciones.push({ que: `${g.name} › ${c.name}`, antes: centavos(cVieja.priceDelta) / 100, despues: centavos(c.priceDelta) / 100 });
      }
      const variantesAntes = porId(cVieja.variants);
      for (const v of c.variants ?? []) {
        const vVieja = variantesAntes.get(v.id);
        if (vVieja && centavos(vVieja.priceDelta) !== centavos(v.priceDelta)) {
          opciones.push({ que: `${g.name} › ${c.name} › ${v.name}`, antes: centavos(vVieja.priceDelta) / 100, despues: centavos(v.priceDelta) / 100 });
        }
      }
    }
  }

  return { precio, opciones };
}

/** ¿Hay algo que anotar? */
export function hayCambioDePrecio(c: CambiosDePrecio): boolean {
  return c.precio !== null || c.opciones.length > 0;
}

/**
 * ¿Dicen lo mismo dos valores JSON? Sin depender del orden de las claves:
 * Postgres guarda un `jsonb` con las claves reordenadas, así que comparar
 * con `JSON.stringify` daría «cambió» cada vez que se guarda sin tocar nada.
 */
export function mismoJson(a: unknown, b: unknown): boolean {
  return canonico(a ?? null) === canonico(b ?? null);
}

function canonico(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonico).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonico(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}
