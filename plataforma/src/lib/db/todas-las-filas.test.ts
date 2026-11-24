import { describe, expect, it } from 'vitest';
import { PAGINA, todasLasFilas } from './todas-las-filas';

/** Una tabla de `n` filas que contesta por rangos, como PostgREST. */
function tabla(n: number) {
  const pedidas: [number, number][] = [];
  const pedir = async (desde: number, hasta: number) => {
    pedidas.push([desde, hasta]);
    const data = Array.from({ length: Math.max(0, Math.min(hasta, n - 1) - desde + 1) }, (_, i) => desde + i);
    return { data, error: null };
  };
  return { pedir, pedidas };
}

describe('todasLasFilas: el respaldo ya no se corta en silencio', () => {
  it('trae más de las 1,000 de una consulta suelta, sin repetir ni saltar', async () => {
    const { pedir, pedidas } = tabla(2 * PAGINA + 37);
    const r = await todasLasFilas(pedir, 200_000);
    expect(r.truncado).toBe(false);
    expect(r.filas).toHaveLength(2 * PAGINA + 37);
    expect(new Set(r.filas).size).toBe(r.filas.length);
    expect(pedidas).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('una tabla vacía o de una página completa exacta termina bien', async () => {
    expect((await todasLasFilas(tabla(0).pedir, 200_000)).filas).toEqual([]);
    const exacta = await todasLasFilas(tabla(PAGINA).pedir, 200_000);
    expect(exacta.filas).toHaveLength(PAGINA);
    expect(exacta.truncado).toBe(false);
  });

  it('al llegar al tope lo dice, en vez de fingir que trajo todo', async () => {
    const r = await todasLasFilas(tabla(5 * PAGINA).pedir, 2 * PAGINA);
    expect(r.filas).toHaveLength(2 * PAGINA);
    expect(r.truncado).toBe(true);
  });

  it('un error de la base no se convierte en un respaldo a medias', async () => {
    const pedir = async (desde: number) => (desde === 0
      ? { data: Array.from({ length: PAGINA }, (_, i) => i), error: null }
      : { data: null, error: { message: 'timeout' } });
    await expect(todasLasFilas(pedir, 200_000)).rejects.toThrow('timeout');
  });
});
