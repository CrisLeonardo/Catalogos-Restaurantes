/** Seguimiento del comensal (auditoría 1.12, M06). */
import { describe, expect, it } from 'vitest';
import { minutosSinAceptar, pasosDelSeguimiento, type TextosSeguimiento } from './seguimiento';

const T: TextosSeguimiento = {
  recibido: 'Recibido', preparando: 'En preparación', listo: 'Listo', listoRecoger: 'Listo para recoger',
  camino: 'En camino', servido: 'Comida servida', entregado: 'Entregado',
};
const base = { createdAt: '2026-11-09T19:02:00Z' };
const resumen = (p: Parameters<typeof pasosDelSeguimiento>[0]) => pasosDelSeguimiento(p, T).map((x) => `${x.clave}:${x.estado}`);

describe('pasos del seguimiento', () => {
  it('recién recibido: espera que lo acepten', () => {
    const pasos = pasosDelSeguimiento({ ...base, status: 'NEW', orderType: 'PICKUP' }, T);
    expect(pasos.map((x) => `${x.clave}:${x.estado}`)).toEqual(['recibido:activo', 'aceptado:pendiente', 'preparando:pendiente', 'listo:pendiente', 'final:pendiente']);
    expect(pasos[0].detalle).toMatch(/Esperando/);
    expect(pasos[3].label).toBe('Listo para recoger');
  });

  it('aceptado y preparando con los platos listos y la hora de aceptación', () => {
    const pasos = pasosDelSeguimiento({ ...base, status: 'PREP', orderType: 'DINE_IN', acceptedAt: '2026-11-09T19:04:00Z', platos: { listos: 2, total: 3 } }, T);
    expect(pasos.map((x) => `${x.clave}:${x.estado}`)).toEqual(['recibido:hecho', 'aceptado:hecho', 'preparando:activo', 'listo:pendiente', 'final:pendiente']);
    expect(pasos[1].hora).toBe('2026-11-09T19:04:00Z');
    expect(pasos[2].detalle).toBe('2 de 3 platos listos');
    expect(pasos[4].label).toBe('Comida servida');
  });

  it('a domicilio pasa por «En camino» y termina «Entregado»', () => {
    expect(resumen({ ...base, status: 'TRANSIT', orderType: 'DELIVERY' }))
      .toEqual(['recibido:hecho', 'aceptado:hecho', 'preparando:hecho', 'listo:hecho', 'camino:activo', 'final:pendiente']);
    expect(resumen({ ...base, status: 'DELIVERED', orderType: 'DELIVERY' }).at(-1)).toBe('final:hecho');
  });
});

describe('aviso si no lo aceptan', () => {
  const creado = Date.parse(base.createdAt);
  it('a los 10 minutos, no antes, y sólo mientras siga recibido', () => {
    expect(minutosSinAceptar({ ...base, status: 'NEW', orderType: 'PICKUP' }, creado + 9 * 60_000)).toBeNull();
    expect(minutosSinAceptar({ ...base, status: 'NEW', orderType: 'PICKUP' }, creado + 12 * 60_000)).toBe(12);
    expect(minutosSinAceptar({ ...base, status: 'PREP', orderType: 'PICKUP' }, creado + 30 * 60_000)).toBeNull();
  });
});
