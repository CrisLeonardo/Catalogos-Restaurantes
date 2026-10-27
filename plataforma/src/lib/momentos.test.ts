import { describe, it, expect } from 'vitest';
import { etiquetaHora, hitoAlcanzado, horaPico, recordDelDia } from './momentos';
import { sumarDias } from '@/lib/caja/dia';

const HOY = '2026-10-27'; // martes

function ventas(pares: Array<[number, number]>): Map<string, number> {
  // [días hacia atrás, total]
  return new Map(pares.map(([d, v]) => [sumarDias(HOY, -d), v]));
}

describe('recordDelDia', () => {
  it('sin venta hoy no hay récord', () => {
    expect(recordDelDia(ventas([[1, 100]]), HOY, 'martes')).toBeNull();
  });

  it('el mejor día del mes exige 7 días con venta antes', () => {
    const pocos = ventas([[0, 900], [1, 100], [2, 100], [3, 100]]);
    expect(recordDelDia(pocos, HOY, 'martes')).toBeNull();
    const suficientes = ventas([[0, 900], ...[1, 2, 3, 4, 5, 6, 8].map((d) => [d, 300] as [number, number])]);
    expect(recordDelDia(suficientes, HOY, 'martes')).toEqual({ tipo: 'mes', texto: 'Tu mejor día del mes' });
  });

  it('empatar no es récord', () => {
    const v = ventas([[0, 500], ...[1, 2, 3, 4, 5, 6, 8].map((d) => [d, 500] as [number, number])]);
    expect(recordDelDia(v, HOY, 'martes')).toBeNull();
  });

  it('el mejor martes compara solo con los martes y exige dos', () => {
    // Un sábado enorme (hace 3 días) impide «el mejor del mes», no «el mejor martes».
    const v = ventas([[0, 800], [3, 5000], [7, 600], [14, 700], [21, 0], [28, 0]]);
    expect(recordDelDia(v, HOY, 'martes')).toEqual({ tipo: 'dia-semana', texto: 'Tu mejor martes del mes' });
    const unSolo = ventas([[0, 800], [3, 5000], [7, 600]]);
    expect(recordDelDia(unSolo, HOY, 'martes')).toBeNull();
  });
});

describe('horaPico', () => {
  it('con menos de 3 pedidos no hay hora pico', () => {
    expect(horaPico([13, 13])).toBeNull();
  });

  it('si ninguna hora junta 2 pedidos no hay hora pico', () => {
    expect(horaPico([9, 12, 15])).toBeNull();
  });

  it('elige la hora con más pedidos y la dice como se habla', () => {
    expect(horaPico([12, 13, 13, 13, 19, 19])).toEqual({ hora: 13, pedidos: 3, texto: 'De 1 a 2 p. m.' });
  });

  it('en empate gana la más temprana y cruza bien el mediodía', () => {
    expect(horaPico([11, 11, 18, 18])).toEqual({ hora: 11, pedidos: 2, texto: 'De 11 a. m. a 12 p. m.' });
  });
});

describe('etiquetaHora', () => {
  it('medianoche y mediodía', () => {
    expect(etiquetaHora(0)).toBe('12 a. m.');
    expect(etiquetaHora(12)).toBe('12 p. m.');
    expect(etiquetaHora(24)).toBe('12 a. m.');
  });
});

describe('hitoAlcanzado', () => {
  it('nada antes de 100 pedidos ni fuera de las ventanas de tiempo', () => {
    expect(hitoAlcanzado(99, 10)).toBeNull();
    expect(hitoAlcanzado(0, 60)).toBeNull();
  });

  it('celebra el último hito de pedidos alcanzado', () => {
    expect(hitoAlcanzado(100, 5)?.clave).toBe('pedidos-100');
    expect(hitoAlcanzado(1234, 400)?.clave).toBe('pedidos-1000');
    expect(hitoAlcanzado(1234, 400)?.titulo).toBe('¡1,000 pedidos!');
  });

  it('el primer mes solo en su ventana', () => {
    expect(hitoAlcanzado(20, 30)?.clave).toBe('primer-mes');
    expect(hitoAlcanzado(20, 44)?.clave).toBe('primer-mes');
    expect(hitoAlcanzado(20, 45)).toBeNull();
  });

  it('el aniversario las dos semanas después de cumplir', () => {
    expect(hitoAlcanzado(50, 365)?.clave).toBe('aniversario-1');
    expect(hitoAlcanzado(50, 378)?.clave).toBe('aniversario-1');
    expect(hitoAlcanzado(50, 379)).toBeNull();
    expect(hitoAlcanzado(50, 731)?.titulo).toBe('¡2 años con Leogin!');
  });
});
