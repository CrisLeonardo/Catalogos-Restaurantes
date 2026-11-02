/**
 * El plano en cualquier pantalla. Lo que se prueba es lo que rompía el
 * teléfono: que el lienzo nunca sea más ancho que el contenedor, que las
 * mesas no se encimen, que el giro salga solo cuando gana y que girar no
 * refleje el local.
 */
import { describe, it, expect } from 'vitest';
import {
  COMPLETO, PLANO_H, PLANO_W, densidadDeMesa, disponerPlano, disponerRejilla,
  distanciaMinima, encuadrar,
} from './plano-salon';

/** Un local de 14 mesas repartido a lo ancho, como el de Rincón 502. */
const LOCAL = [
  { x: 0.1, y: 0.2 }, { x: 0.25, y: 0.2 }, { x: 0.4, y: 0.2 }, { x: 0.55, y: 0.2 }, { x: 0.7, y: 0.2 }, { x: 0.85, y: 0.2 },
  { x: 0.1, y: 0.5 }, { x: 0.25, y: 0.5 }, { x: 0.4, y: 0.5 }, { x: 0.55, y: 0.5 },
  { x: 0.1, y: 0.8 }, { x: 0.25, y: 0.8 }, { x: 0.4, y: 0.8 }, { x: 0.55, y: 0.8 },
];
const TELEFONO = { w: 347, h: 560 };
const PC = { w: 1100, h: 640 };

describe('encuadrar', () => {
  it('sin nada dibujado enseña el local entero', () => {
    expect(encuadrar([])).toEqual(COMPLETO);
  });

  it('recorta a lo dibujado con aire alrededor', () => {
    const enc = encuadrar([{ x0: 0.1, y0: 0.1, x1: 0.3, y1: 0.3 }]);
    expect(enc.x).toBeCloseTo(0.01);
    expect(enc.w).toBeCloseTo(0.38);
  });
});

describe('disponerPlano', () => {
  it('si las mesas chocarían, el lienzo crece en vez de encimarlas', () => {
    const apretado = [{ x: 0.3, y: 0.5 }, { x: 0.38, y: 0.5 }, { x: 0.46, y: 0.5 }];
    const d = disponerPlano(COMPLETO, apretado, 340, 220, { giro: 'normal' });
    expect(d.ancho).toBeGreaterThan(340);
    const sep = distanciaMinima(apretado.map((p) => d.punto(p.x, p.y)));
    expect(d.mesa).toBeLessThan(sep);
  });

  it('el lienzo nunca es más ancho ni más alto que el contenedor si las mesas caben', () => {
    for (const c of [TELEFONO, PC]) {
      const d = disponerPlano(COMPLETO, LOCAL, c.w, c.h);
      expect(d.ancho).toBeLessThanOrEqual(c.w + 0.001);
      expect(d.alto).toBeLessThanOrEqual(c.h + 0.001);
    }
  });

  it('en un teléfono vertical gira un local ancho', () => {
    expect(disponerPlano(COMPLETO, LOCAL, TELEFONO.w, TELEFONO.h).girado).toBe(true);
  });

  it('en una PC no gira', () => {
    expect(disponerPlano(COMPLETO, LOCAL, PC.w, PC.h).girado).toBe(false);
  });

  it('respeta el giro que pidió quien mira', () => {
    expect(disponerPlano(COMPLETO, LOCAL, TELEFONO.w, TELEFONO.h, { giro: 'normal' }).girado).toBe(false);
    expect(disponerPlano(COMPLETO, LOCAL, PC.w, PC.h, { giro: 'girado' }).girado).toBe(true);
  });

  it('girar mayor gana en tamaño de mesa', () => {
    const normal = disponerPlano(COMPLETO, LOCAL, TELEFONO.w, TELEFONO.h, { giro: 'normal' });
    const girado = disponerPlano(COMPLETO, LOCAL, TELEFONO.w, TELEFONO.h);
    expect(girado.mesa).toBeGreaterThan(normal.mesa);
  });

  it('gira en el sentido del reloj, sin reflejar el local', () => {
    const d = disponerPlano(COMPLETO, LOCAL, TELEFONO.w, TELEFONO.h, { giro: 'girado' });
    // Arriba a la izquierda del dibujo → arriba a la DERECHA del teléfono.
    const p = d.punto(0, 0);
    expect(p.left).toBeCloseTo(d.ancho);
    expect(p.top).toBeCloseTo(0);
    // Abajo a la izquierda del dibujo → arriba a la izquierda.
    const q = d.punto(0, 1);
    expect(q.left).toBeCloseTo(0);
    expect(q.top).toBeCloseTo(0);
  });

  it('usa la proporción del editor (16:10), no 4:3', () => {
    const d = disponerPlano(COMPLETO, [], PC.w, PC.h, { giro: 'normal' });
    expect(d.ancho / d.alto).toBeCloseTo(PLANO_W / PLANO_H);
  });

  it('las mesas no se enciman si cabe el mínimo táctil', () => {
    const d = disponerPlano(COMPLETO, LOCAL, TELEFONO.w, TELEFONO.h);
    const sep = distanciaMinima(LOCAL.map((p) => d.punto(p.x, p.y)));
    expect(d.mesa).toBeGreaterThanOrEqual(44);
    expect(d.mesa).toBeLessThan(sep);
  });

  it('con mesas pegadas se queda en el mínimo táctil', () => {
    const apretado = [{ x: 0.5, y: 0.5 }, { x: 0.51, y: 0.5 }];
    expect(disponerPlano(COMPLETO, apretado, TELEFONO.w, TELEFONO.h).mesa).toBe(44);
  });

  it('con una mesa sola no se come la pantalla', () => {
    expect(disponerPlano(COMPLETO, [{ x: 0.5, y: 0.5 }], PC.w, PC.h).mesa).toBe(96);
  });

  it('la caja de una zona fija gira con el plano', () => {
    const d = disponerPlano(COMPLETO, [], 500, 800, { giro: 'girado' });
    const barra = d.caja({ x: 0.5, y: 0.9, w: 0.6, h: 0.1 });
    // Una barra horizontal abajo del dibujo queda vertical a la izquierda.
    expect(barra.height).toBeGreaterThan(barra.width);
    expect(barra.left).toBeLessThan(d.ancho / 2);
  });
});

describe('disponerRejilla', () => {
  it('20 mesas en un teléfono caben sin desplazar de lado', () => {
    const r = disponerRejilla(20, TELEFONO.w, TELEFONO.h);
    expect(r.ancho).toBeLessThanOrEqual(TELEFONO.w + 0.001);
    expect(r.mesa).toBeGreaterThanOrEqual(44);
    expect(r.cols * r.filas).toBeGreaterThanOrEqual(20);
  });

  it('con demasiadas mesas crece hacia abajo, nunca de lado', () => {
    const r = disponerRejilla(80, TELEFONO.w, 300);
    expect(r.ancho).toBeLessThanOrEqual(TELEFONO.w + 0.001);
    expect(r.alto).toBeGreaterThan(300);
    expect(r.mesa).toBeGreaterThanOrEqual(44);
  });

  it('los centros quedan dentro del lienzo', () => {
    const r = disponerRejilla(7, 600, 400);
    for (let i = 0; i < 7; i++) {
      const p = r.punto(i);
      expect(p.left).toBeGreaterThan(0);
      expect(p.left).toBeLessThan(r.ancho);
      expect(p.top).toBeLessThan(r.alto);
    }
  });
});

describe('densidadDeMesa', () => {
  it('lo que cabe crece con el ancho', () => {
    expect(densidadDeMesa(48)).toBe('mini');
    expect(densidadDeMesa(70)).toBe('media');
    expect(densidadDeMesa(100)).toBe('completa');
  });
});
