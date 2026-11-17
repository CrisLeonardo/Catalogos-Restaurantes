import { describe, expect, it } from 'vitest';
import { abrible, buscarIntenciones, INTENCIONES, mensajeASoporte, normalizar } from './intenciones';

const primera = (q: string) => buscarIntenciones(q)[0]?.id;

describe('ayuda por intención (R39, X18)', () => {
  it('«impresora» lleva a preparar la PC, no a explicar el recibo', () => {
    expect(primera('impresora')).toBe('impresora');
    expect(primera('no imprime la comanda')).toBe('impresora');
  });

  it('los cinco casos de la auditoría llegan a su respuesta', () => {
    expect(primera('no me entran pedidos')).toBe('no-entran-pedidos');
    expect(primera('quiero cerrar por hoy')).toBe('cerrar-por-hoy');
    expect(primera('¿Cómo cambio el PRECIO de un platillo?')).toBe('cambiar-precio');
    expect(primera('olvidé mi contraseña')).toBe('no-puedo-entrar');
    expect(primera('cerrar la caja')).toBe('cerrar-caja');
  });

  it('no depende de acentos ni mayúsculas', () => {
    expect(normalizar('¿Cómo CAMBIO el diseño?')).toBe('como cambio el diseno');
    expect(primera('diseño de mi carta')).toBe('diseno');
  });

  it('lo que no tiene que ver no responde', () => {
    expect(buscarIntenciones('x')).toEqual([]);
    expect(buscarIntenciones('astronauta')).toEqual([]);
  });

  it('ninguna respuesta lleva a una puerta cerrada', () => {
    const precio = INTENCIONES.find((i) => i.id === 'cambiar-precio')!;
    expect(abrible(precio, (s) => s === 'cocina')).toBe(false);
    expect(abrible(precio, (s) => s === 'catalogo')).toBe(true);
    for (const i of INTENCIONES) if (i.seccion) expect(i.sinPermiso, i.id).toBeTruthy();
  });

  it('cinco casos comunes y cada intención con su salida', () => {
    expect(INTENCIONES.filter((i) => i.comun)).toHaveLength(5);
    for (const i of INTENCIONES) expect(i.diagnostico || i.ruta, i.id).toBeTruthy();
  });
});

describe('mensaje a soporte (R39.4)', () => {
  it('lleva el contexto y nada privado', () => {
    expect(mensajeASoporte({ restaurante: 'Rincón 502', plan: 'Premium', busqueda: 'no me entran pedidos', version: 'abc1234' }))
      .toBe('Hola, soy de Rincón 502 (plan Premium). Busqué «no me entran pedidos» en Ayuda y no lo resolví. Versión abc1234.');
  });
});
