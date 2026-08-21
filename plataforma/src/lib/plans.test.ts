import { describe, expect, it } from 'vitest';
import {
  hasModuleEntitlement,
  hasPlanFeature,
  isModuleIncluded,
  isUpgrade,
  nextPlan,
  withPlanFloor,
} from './plans';

/* ── Titularidad de módulos ─────────────────────────────────────
   Bug real que motiva estos tests: Premium entregaba 4 de 7 módulos
   incluidos porque restaurants.modules (jsonb, editado a mano) no
   coincidía con lo que plans.ts prometía. La regla es "el plan manda". */
describe('isModuleIncluded / hasModuleEntitlement', () => {
  it('Premium incluye los 7 módulos a la carta sin costo', () => {
    for (const key of ['llamada_mesero', 'encuestas', 'cupones', 'loyalty', 'recetas', 'reservaciones', 'lista_espera'] as const) {
      expect(isModuleIncluded('PREMIUM', key)).toBe(true);
    }
  });

  it('Básico y Estándar no incluyen ningún módulo a la carta', () => {
    expect(isModuleIncluded('BASICO', 'loyalty')).toBe(false);
    expect(isModuleIncluded('ESTANDAR', 'loyalty')).toBe(false);
  });

  it('hasModuleEntitlement da acceso si el plan lo incluye, aunque el jsonb no lo tenga', () => {
    expect(hasModuleEntitlement('PREMIUM', null, 'loyalty')).toBe(true);
    expect(hasModuleEntitlement('PREMIUM', {}, 'loyalty')).toBe(true);
  });

  it('hasModuleEntitlement también da acceso si Leogin lo activó manualmente fuera del plan', () => {
    expect(hasModuleEntitlement('BASICO', { loyalty: true }, 'loyalty')).toBe(true);
  });

  it('sin plan incluido ni compra a la carta, no hay acceso', () => {
    expect(hasModuleEntitlement('BASICO', { loyalty: false }, 'loyalty')).toBe(false);
    expect(hasModuleEntitlement('BASICO', null, 'loyalty')).toBe(false);
  });

  it('plan ausente/nulo se trata como BASICO (el más restrictivo)', () => {
    expect(hasModuleEntitlement(null, null, 'loyalty')).toBe(false);
    expect(hasModuleEntitlement(undefined, null, 'loyalty')).toBe(false);
  });
});

describe('withPlanFloor', () => {
  it('BASICO no fuerza ninguna bandera además de catalog', () => {
    expect(withPlanFloor('BASICO', {})).toEqual({ catalog: true });
  });

  it('Premium fuerza todas sus banderas y módulos incluidos', () => {
    const out = withPlanFloor('PREMIUM', {});
    expect(out.orders).toBe(true);
    expect(out.whatsapp_notify).toBe(true);
    expect(out.finanzas).toBe(true);
    expect(out.analitica).toBe(true);
    expect(out.loyalty).toBe(true);
    expect(out.reservaciones).toBe(true);
  });

  it('nunca apaga algo que ya estaba encendido a mano', () => {
    const out = withPlanFloor('BASICO', { proveedores: true });
    expect(out.proveedores).toBe(true);
  });

  it('el piso gana aunque el jsonb lo traiga apagado (el bug original)', () => {
    const out = withPlanFloor('PREMIUM', { loyalty: false });
    expect(out.loyalty).toBe(true);
  });
});

describe('hasPlanFeature', () => {
  it('Estándar ya incluye finanzas (piso del plan)', () => {
    expect(hasPlanFeature('ESTANDAR', null, 'finanzas')).toBe(true);
  });

  it('Básico no incluye finanzas por defecto', () => {
    expect(hasPlanFeature('BASICO', null, 'finanzas')).toBe(false);
  });

  it('un override manual en modules puede dar la función aunque el plan no la incluya', () => {
    expect(hasPlanFeature('BASICO', { finanzas: true }, 'finanzas')).toBe(true);
  });

  it('un código de plan inválido/corrupto cae a BASICO en vez de reventar', () => {
    expect(hasPlanFeature('NO_EXISTE', null, 'orders')).toBe(false);
  });
});

describe('isUpgrade / nextPlan', () => {
  it('Premium es upgrade sobre Básico', () => {
    expect(isUpgrade('BASICO', 'PREMIUM')).toBe(true);
  });

  it('Básico no es upgrade sobre Premium', () => {
    expect(isUpgrade('PREMIUM', 'BASICO')).toBe(false);
  });

  it('el mismo plan no cuenta como upgrade', () => {
    expect(isUpgrade('PREMIUM', 'PREMIUM')).toBe(false);
  });

  it('nextPlan avanza dentro de los planes públicos', () => {
    expect(nextPlan('BASICO')).toBe('ESTANDAR');
    expect(nextPlan('ESTANDAR')).toBe('PREMIUM');
  });

  it('nextPlan no ofrece nada después del último plan público', () => {
    expect(nextPlan('PREMIUM')).toBeNull();
  });

  it('nextPlan no recomienda PRO (pausado, fuera de PUBLIC_PLANS)', () => {
    expect(nextPlan('PRO')).toBeNull();
  });
});
