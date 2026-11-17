import { describe, expect, it } from 'vitest';
import { BUILTIN_TEMPLATES, applyTemplateToConfig } from './templates';
import { DEFAULT_CONFIG } from './defaults';
import { clavesRecomendadas, contraste, esElActual, legibilidad, nombreDelDiseno, recomendaciones } from './recomendaciones';

describe('contraste', () => {
  it('negro sobre blanco es 21 y un color igual es 1', () => {
    expect(contraste('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contraste('#777', '#777')).toBeCloseTo(1, 5);
    expect(contraste('azul', '#fff')).toBeNull();
  });
});

describe('clavesRecomendadas', () => {
  it('con muchas fotos, fotos grandes primero', () => {
    expect(clavesRecomendadas({ total: 30, conFoto: 25, paraLlevar: false })).toEqual(['fotos', 'revista', 'rapida']);
    expect(clavesRecomendadas({ total: 30, conFoto: 25, paraLlevar: true })[1]).toBe('app');
  });

  it('con pocas fotos (Rincón: 13 de 38), filas con miniatura primero', () => {
    expect(clavesRecomendadas({ total: 38, conFoto: 13, paraLlevar: false })).toEqual(['rapida', 'fotos', 'elegante']);
  });

  it('casi sin fotos no ofrece la rejilla de fotos si vende para llevar', () => {
    const r = clavesRecomendadas({ total: 20, conFoto: 1, paraLlevar: true });
    expect(r[0]).toBe('elegante');
    expect(r).not.toContain('fotos');
  });

  it('con muchísimos platillos, encontrar rápido va primero', () => {
    expect(clavesRecomendadas({ total: 90, conFoto: 80, paraLlevar: false })[0]).toBe('rapida');
  });

  it('siempre son tres y sin repetir', () => {
    for (const total of [0, 5, 40, 100]) {
      for (const conFoto of [0, Math.floor(total / 2), total]) {
        const r = clavesRecomendadas({ total, conFoto, paraLlevar: total % 2 === 0 });
        expect(r).toHaveLength(3);
        expect(new Set(r).size).toBe(3);
      }
    }
  });
});

describe('recomendaciones', () => {
  it('nunca recomienda una combinación poco legible', () => {
    for (const r of recomendaciones({ total: 38, conFoto: 13, paraLlevar: true })) {
      expect(legibilidad(r.plantilla.config).ok).toBe(true);
    }
  });

  it('la mayoría del catálogo se lee bien', () => {
    const malas = BUILTIN_TEMPLATES.filter((t) => !legibilidad(t.config).ok);
    expect(malas.length).toBeLessThan(BUILTIN_TEMPLATES.length / 2);
  });
});

describe('el diseño actual', () => {
  it('reconoce la plantilla aplicada y la nombra', () => {
    const tpl = BUILTIN_TEMPLATES.find((t) => t.structure === 'compacto')!;
    const config = applyTemplateToConfig(DEFAULT_CONFIG, tpl);
    expect(esElActual(config, tpl)).toBe(true);
    expect(nombreDelDiseno(config).estructura).toBe('Compacto');
  });
});
