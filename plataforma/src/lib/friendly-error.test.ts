import { describe, expect, it } from 'vitest';

import { friendlyError, GENERIC_ERROR } from './friendly-error';

/* Lo que se prueba aquí no es la expresión regular: es la promesa de que al
   dueño de un restaurante nunca le sale jerga en pantalla, y de que un mensaje
   que YA estaba bien escrito no se pierde por el camino. */

describe('friendlyError', () => {
  it('traduce la caída de red más común', () => {
    expect(friendlyError(new TypeError('Failed to fetch')))
      .toBe('No se pudo conectar. Revisá tu internet e intentá otra vez.');
  });

  it('convierte los 500 en algo accionable', () => {
    expect(friendlyError(new Error('Request failed with status code 500'))).toBe(GENERIC_ERROR);
  });

  it('explica la sesión caducada en vez de decir JWT', () => {
    const msg = friendlyError(new Error('JWT expired'));
    expect(msg).toContain('sesión caducó');
    expect(msg).not.toMatch(/jwt/i);
  });

  it('traduce el choque de nombre repetido', () => {
    expect(friendlyError(new Error('duplicate key value violates unique constraint "products_name_key"')))
      .toContain('Ya existe algo con ese nombre');
  });

  it('dice por qué no se puede borrar', () => {
    expect(friendlyError(new Error('update or delete on table "categories" violates foreign key constraint')))
      .toContain('algo más lo está usando');
  });

  it('RESPETA un mensaje que ya estaba escrito para una persona', () => {
    const bueno = 'Falta instalar el servicio en la PC del local — sigue los pasos de abajo.';
    expect(friendlyError(new Error(bueno))).toBe(bueno);
  });

  it('no deja pasar jerga aunque no la reconozca', () => {
    expect(friendlyError(new Error("TypeError: undefined is not an object (evaluating 'a.b')")))
      .toBe(GENERIC_ERROR);
    expect(friendlyError(new Error('PGRST116'))).toBe(GENERIC_ERROR);
    expect(friendlyError(new Error('{"code":"22P02"}'))).toBe(GENERIC_ERROR);
  });

  it('nunca devuelve vacío', () => {
    expect(friendlyError(undefined)).toBe(GENERIC_ERROR);
    expect(friendlyError(new Error('   '))).toBe(GENERIC_ERROR);
  });

  it('acepta un string suelto, no solo Error', () => {
    expect(friendlyError('Failed to fetch')).toContain('Revisá tu internet');
  });
});
