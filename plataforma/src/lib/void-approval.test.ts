/**
 * Quién puede firmar una anulación (F-06).
 *
 * `approved_by` existía desde la migración 079 y el código mandaba `null`
 * siempre: cualquiera con permiso de mesero podía quitar de la cuenta un
 * plato ya cocinado sin que nadie más se enterara. Estas dos funciones son
 * las que deciden cuándo hace falta una firma y quién puede darla, así que
 * son la regla entera del control.
 */
import { describe, it, expect } from 'vitest';
import { necesitaAprobacion, puedeAprobar } from './void-approval';

describe('necesitaAprobacion', () => {
  it('lo que aún no salió a cocina se anula solo', () => {
    // Corregirse mientras se escribe la comanda no mueve dinero.
    expect(necesitaAprobacion('NEW')).toBe(false);
  });

  it('todo lo demás necesita firma', () => {
    // Desde PREP el plato ya se está cocinando: hay comida y coste detrás.
    for (const s of ['PREP', 'READY', 'TRANSIT', 'SERVED']) {
      expect(necesitaAprobacion(s)).toBe(true);
    }
  });
});

describe('puedeAprobar', () => {
  it('el dueño firma', () => {
    expect(puedeAprobar('RESTAURANT_OWNER', null)).toBe(true);
    expect(puedeAprobar('SUPER_ADMIN', null)).toBe(true);
  });

  it('un mesero puro NO firma: es justo a quien controla esto', () => {
    expect(puedeAprobar('RESTAURANT_STAFF', ['mesero'])).toBe(false);
    // El rol viejo, que solo conserva acceso a "mesero".
    expect(puedeAprobar('RESTAURANT_WAITER', null)).toBe(false);
  });

  it('un staff con acceso al panel firma, aunque también tome mesas', () => {
    // El encargado que además atiende: la línea no es «¿usa el panel de
    // mesero?» sino «¿lleva algo más del local?».
    expect(puedeAprobar('RESTAURANT_STAFF', ['mesero', 'finanzas'])).toBe(true);
    expect(puedeAprobar('RESTAURANT_STAFF', ['pedidos'])).toBe(true);
  });

  it('un staff sin permisos definidos todavía firma (aún sin restringir)', () => {
    // Mismo criterio que `can()`: permissions null = no se ha limitado.
    expect(puedeAprobar('RESTAURANT_STAFF', null)).toBe(true);
  });

  it('un repartidor puro no es mesero, así que no lo bloquea esta regla', () => {
    // No es un descuido: quien decide de verdad si puede tocar el pedido es
    // el permiso 'mesero' de voidOrder. Aquí solo se separa encargado de
    // mesero, y un repartidor nunca llega a esta pantalla.
    expect(puedeAprobar('RESTAURANT_STAFF', ['reparto'])).toBe(true);
  });
});
