import { describe, it, expect } from 'vitest';
import { newRestaurantBilling } from './billing-signup';

const AHORA = Date.UTC(2026, 7, 19, 12, 0, 0);
const alta = (over: Partial<Parameters<typeof newRestaurantBilling>[0]> = {}) =>
  newRestaurantBilling({ planCode: 'PREMIUM', trialDays: 30, isFirstOfOwner: true, now: AHORA, ...over });

describe('newRestaurantBilling', () => {
  it('el primer restaurante de una persona lleva su prueba', () => {
    const r = alta();
    expect(r.active).toBe(false); // en prueba todavía no se cobra
    expect(r.trial_ends_at).toBe(new Date(AHORA + 30 * 86_400_000).toISOString());
  });

  it('del segundo en adelante se cobra desde el día uno', () => {
    // La regla del negocio: la prueba es una por persona, no por local.
    const r = alta({ isFirstOfOwner: false });
    expect(r.active).toBe(true);
    expect(r.trial_ends_at).toBeNull();
  });

  it('BÁSICO nace activo y sin prueba, sea el primero o no', () => {
    // Es gratis para siempre: no hay nada que probar ni que graduar.
    for (const isFirstOfOwner of [true, false]) {
      const r = alta({ planCode: 'BASICO', isFirstOfOwner });
      expect(r.active).toBe(true);
      expect(r.trial_ends_at).toBeNull();
    }
  });

  it('con la prueba apagada en configuración, nadie la recibe', () => {
    const r = alta({ trialDays: 0 });
    expect(r.active).toBe(true);
    expect(r.trial_ends_at).toBeNull();
  });

  it('no acepta días de prueba negativos ni rotos', () => {
    // Un valor malo en /super/configuracion no puede regalar una prueba
    // eterna ni crear una fecha inválida.
    expect(alta({ trialDays: -5 }).trial_ends_at).toBeNull();
    expect(alta({ trialDays: 7.4 }).trial_ends_at).toBe(new Date(AHORA + 7 * 86_400_000).toISOString());
  });

  it('siempre deja el precio automático y la moneda puestos', () => {
    for (const r of [alta(), alta({ isFirstOfOwner: false }), alta({ planCode: 'BASICO' })]) {
      expect(r.auto_price).toBe(true);
      expect(r.currency).toBe('GTQ');
    }
  });
});
