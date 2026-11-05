import { describe, expect, it } from 'vitest';
import { defaultPlanPricing, planPresentation, planChangePresentation, planGrowthCopy, planComparisonCopy, capabilityStateLabel, publicPlanCapabilities, type PlanCode } from './plans';

const pricing = defaultPlanPricing();
describe('contrato de planes compartido por las superficies', () => {
  it.each([
    ['ESTANDAR', 199, 2, 0], ['PREMIUM', 349, 3, 7], ['EN_LINEA', 99, 2, 0],
  ] as [PlanCode, number, number, number][])('%s conserva precio, modalidades y módulos incluidos', (plan, amount, modes, includedModules) => {
    const c = planPresentation({ plan, pricing, modules: {}, billing: { auto_price: true, monthly_fee: 10 }, computedFee: amount });
    expect(c.monthlyAmount).toBe(amount);
    expect(c.maxOrderTypes).toBe(modes);
    expect(c.moduleCounts.included).toBe(includedModules);
    expect(c.includedCount).toBe(c.capabilities.filter((item) => item.included).length);
  });
  it('Estándar distingue las tres modalidades permitidas de las dos encendidas', () => {
    const c = planPresentation({ plan: 'ESTANDAR', pricing, orderTypes: ['dine_in', 'delivery'] });
    expect(c.availableOrderTypes).toHaveLength(3);
    expect(c.selectedOrderTypes).toEqual(['dine_in', 'delivery']);
    expect(c.orderScope).toContain('2 de 3');
    expect(c.selectedScope).not.toContain('Para llevar');
    expect(c.selectedScope).toContain('A domicilio');
  });
  it('apagar canales o módulos no modifica el precio fijo de Premium', () => {
    const input = { plan: 'PREMIUM', pricing, billing: { auto_price: true, monthly_fee: 349 }, computedFee: 349 };
    const c = planPresentation({ ...input, orderTypes: ['pickup'], settings: { loyalty: { enabled: false } } });
    expect(c.monthlyAmount).toBe(349);
    expect(c.capabilities.find((item) => item.key === 'loyalty')).toMatchObject({ included: true, enabled: true, active: false, configured: null });
  });
  it('la excepción manual, incluso de cero, no se reemplaza por la tarifa pública', () => {
    for (const amount of [275.25, 0]) {
      const c = planPresentation({ plan: 'PREMIUM', pricing, billing: { auto_price: false, monthly_fee: amount, currency: 'GTQ' }, computedFee: 349 });
      expect(c.monthlyAmount).toBe(amount);
      expect(c.publicAmount).toBe(349);
      expect(c.manual).toBe(true);
    }
  });
  it('una tarifa pública de excepción conserva sus centavos en todas las descripciones', () => {
    const overridden = { ...pricing, prices: { ...pricing.prices, PREMIUM: 421.75 } };
    const c = planPresentation({ plan: 'PREMIUM', pricing: overridden });
    expect(c.publicLabel).toBe('Q421.75 / mes');
    expect(planComparisonCopy(overridden)).toContain(c.publicLabel);
  });
  it('mantiene la moneda de un acuerdo particular sin convertir la tarifa pública', () => {
    const c = planPresentation({ plan: 'PREMIUM', pricing, billing: { auto_price: false, monthly_fee: 80, currency: 'USD' } });
    expect(c.currency).toBe('USD');
    expect(c.monthlyLabel).toBe('$80 USD / mes');
    expect(c.publicLabel).toBe('Q349 / mes');
  });
  it('la vista previa de un cambio conserva el acuerdo manual, incluso al elegir Básico', () => {
    const current = planPresentation({ plan: 'PREMIUM', pricing, billing: { auto_price: false, monthly_fee: 275.25 } });
    expect(planChangePresentation(current, 'ESTANDAR', pricing).monthlyAmount).toBe(275.25);
    expect(planChangePresentation(current, 'BASICO', pricing).monthlyAmount).toBe(275.25);
    expect(planChangePresentation(null, 'BASICO', pricing).monthlyAmount).toBe(0);
  });
  it('En línea avisa del tope blando sin prometer pedidos ilimitados ni cortar ventas', () => {
    const c = planPresentation({ plan: 'EN_LINEA', pricing, orderTypes: ['dine_in', 'pickup', 'delivery'] });
    expect(c.selectedOrderTypes).toEqual(['pickup', 'delivery']);
    expect(c.policy).toContain('300');
    expect(c.policy).toContain('ningún pedido se corta');
    expect(planGrowthCopy(pricing)).not.toContain('en ningún plan');
  });
  it('incluido, habilitado, configurado y activo son dimensiones distintas', () => {
    const c = planPresentation({ plan: 'ESTANDAR', pricing, modules: { loyalty: true }, configured: { loyalty: false }, settings: { loyalty: { enabled: false } } });
    const loyalty = c.capabilities.find((item) => item.key === 'loyalty')!;
    expect(loyalty).toMatchObject({ included: false, enabled: true, configured: false, active: false });
    expect(capabilityStateLabel(loyalty)).toContain('sin configurar');
    expect(c.moduleCounts.configured).toBe(0);
  });
  it('no anuncia los módulos exclusivos del plan pausado en la comparativa pública', () => {
    expect(publicPlanCapabilities().some((item) => item.key === 'fel' || item.key === 'proveedores')).toBe(false);
  });
  it('Básico sí incluye su menú QR aunque no incluya pedidos', () => {
    const c = planPresentation({ plan: 'BASICO', pricing });
    expect(c.capabilities.find((item) => item.key === 'catalogue')?.included).toBe(true);
    expect(c.capabilities.find((item) => item.key === 'orders')?.included).toBe(false);
  });
  it('una excepción de inventario no promete también analítica y personal', () => {
    const c = planPresentation({ plan: 'ESTANDAR', pricing, modules: { inventario: true } });
    expect(c.capabilities.find((item) => item.key === 'inventory')?.enabled).toBe(true);
    expect(c.capabilities.find((item) => item.key === 'analytics')?.enabled).toBe(false);
    expect(c.capabilities.find((item) => item.key === 'staff')?.enabled).toBe(false);
  });
  it('la lectura no modifica el acuerdo recibido al preparar su presentación', () => {
    const billing = Object.freeze({ auto_price: false, monthly_fee: 275.25, started_at: '2026-10-01' });
    planPresentation({ plan: 'PREMIUM', pricing, billing, computedFee: 349 });
    expect(billing.monthly_fee).toBe(275.25);
  });
});
