import { describe, expect, it } from 'vitest';
import { BLOQUE, porBloques } from './por-bloques';

function tabla(n: number) {
  const filas = Array.from({ length: n }, (_, i) => ({ id: i }));
  const pedidas: Array<[number, number]> = [];
  const pedir = async (desde: number, hasta: number) => {
    pedidas.push([desde, hasta]);
    return { data: filas.slice(desde, hasta + 1), error: null };
  };
  return { pedir, pedidas };
}

describe('porBloques (CV-09)', () => {
  it('trae más de 1,000 filas sin cortar', async () => {
    const t = tabla(2 * BLOQUE + 200);
    const r = await porBloques(t.pedir);
    expect(r.data).toHaveLength(2 * BLOQUE + 200);
    expect(t.pedidas).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('con exactamente 1,000 pide un bloque más y termina vacío', async () => {
    const t = tabla(BLOQUE);
    expect((await porBloques(t.pedir)).data).toHaveLength(BLOQUE);
    expect(t.pedidas).toHaveLength(2);
  });

  it('un error en un bloque no se hace pasar por lectura completa', async () => {
    let n = 0;
    const r = await porBloques(async () => (n++ === 0
      ? { data: Array.from({ length: BLOQUE }, () => ({})), error: null }
      : { data: null, error: { message: 'caída' } }));
    expect(r.data).toBeNull();
    expect(r.error?.message).toBe('caída');
  });
});
