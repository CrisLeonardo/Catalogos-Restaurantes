import { describe, it, expect } from 'vitest';
import { diaDeCobroDelAlta, newRestaurantBilling } from './billing-signup';

const AHORA = Date.UTC(2026, 7, 19, 12, 0, 0);
const alta = (over: Partial<Parameters<typeof newRestaurantBilling>[0]> = {}) =>
  newRestaurantBilling({ planCode: 'PREMIUM', trialDays: 14, ownerId: 'dueno', now: AHORA, ...over });

describe('newRestaurantBilling', () => {
  it('cada plan de pago inicia 14 días de prueba sin crear cobros', () => {
    for (const planCode of ['EN_LINEA', 'ESTANDAR', 'PREMIUM'] as const) {
      const r = alta({ planCode });
      expect(r).toMatchObject({
        active: false, trial_plan: planCode, trial_started_by: 'dueno',
        trial_started_at: new Date(AHORA).toISOString(),
        trial_ends_at: new Date(AHORA + 14 * 86_400_000).toISOString(),
      });
    }
  });

  it('Básico sigue gratis y se puede probar un plan de pago después', () => {
    const r = alta({ planCode: 'BASICO' });
    expect(r).toMatchObject({ active: true, trial_ends_at: null });
    expect(r.trial_started_at).toBeUndefined();
  });

  it('con la prueba apagada en configuración, nadie la recibe', () => {
    const r = alta({ trialDays: 0 });
    expect(r.active).toBe(true);
    expect(r.trial_ends_at).toBeNull();
  });

  it('acepta 14 días exactos cuando se habilita la oferta', () => {
    // Un valor malo en /super/configuracion no puede regalar una prueba
    // eterna ni crear una fecha inválida.
    expect(alta({ trialDays: -5 }).trial_ends_at).toBeNull();
    expect(alta({ trialDays: 7.4 }).trial_ends_at).toBe(new Date(AHORA + 14 * 86_400_000).toISOString());
  });

  it('la mensualidad vence el día del alta, no el 1 ya pasado (LZ-01)', () => {
    // 19 de agosto a mediodía UTC = 19 de agosto en Guatemala.
    expect(alta({ trialDays: 0 })).toMatchObject({ billing_day: 19, started_at: '2026-08-19' });
  });

  it('el día sale de la fecha de Guatemala, no de la UTC', () => {
    // 1 de septiembre a las 03:00 UTC todavía es 31 de agosto en Guatemala.
    expect(diaDeCobroDelAlta(Date.UTC(2026, 8, 1, 3, 0, 0))).toEqual({ billing_day: 28, started_at: '2026-08-31' });
  });

  it('el 29, 30 y 31 se cobran el 28', () => {
    expect(diaDeCobroDelAlta(Date.UTC(2026, 9, 30, 18, 0, 0)).billing_day).toBe(28);
    expect(diaDeCobroDelAlta(Date.UTC(2026, 9, 5, 18, 0, 0)).billing_day).toBe(5);
  });

  it('siempre deja el precio automático y la moneda puestos', () => {
    for (const r of [alta(), alta({ trialDays: 0 }), alta({ planCode: 'BASICO' })]) {
      expect(r.auto_price).toBe(true);
      expect(r.currency).toBe('GTQ');
    }
  });
});
