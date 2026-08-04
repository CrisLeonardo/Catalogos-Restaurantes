import { describe, expect, it } from 'vitest';
import { computeCouponDiscount, isCouponLive, type Coupon } from './cupones';

const BASE_COUPON: Coupon = {
  id: 'c1',
  restaurant_id: 'r1',
  code: 'PROMO10',
  description: null,
  discount_type: 'PERCENT',
  discount_value: 10,
  min_order: null,
  max_uses: null,
  uses: 0,
  valid_from: null,
  valid_until: null,
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
};

describe('computeCouponDiscount', () => {
  it('calcula un porcentaje sobre el subtotal', () => {
    expect(computeCouponDiscount(BASE_COUPON, 100)).toBe(10);
  });

  it('aplica un monto fijo tal cual', () => {
    const fixed: Coupon = { ...BASE_COUPON, discount_type: 'FIXED', discount_value: 15 };
    expect(computeCouponDiscount(fixed, 100)).toBe(15);
  });

  it('nunca deja el descuento por encima del subtotal (monto fijo mayor al pedido)', () => {
    const fixed: Coupon = { ...BASE_COUPON, discount_type: 'FIXED', discount_value: 500 };
    expect(computeCouponDiscount(fixed, 100)).toBe(100);
  });

  it('nunca devuelve un descuento negativo (discount_value negativo)', () => {
    const negative: Coupon = { ...BASE_COUPON, discount_type: 'FIXED', discount_value: -20 };
    expect(computeCouponDiscount(negative, 100)).toBe(0);
  });
});

describe('isCouponLive', () => {
  it('es válido cuando no hay restricciones', () => {
    expect(isCouponLive(BASE_COUPON, 100)).toBe(true);
  });

  it('es inválido si is_active es false (pausado)', () => {
    expect(isCouponLive({ ...BASE_COUPON, is_active: false }, 100)).toBe(false);
  });

  it('es inválido antes de valid_from', () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    expect(isCouponLive({ ...BASE_COUPON, valid_from: future }, 100)).toBe(false);
  });

  it('es inválido después de valid_until', () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    expect(isCouponLive({ ...BASE_COUPON, valid_until: past }, 100)).toBe(false);
  });

  it('es inválido cuando ya alcanzó max_uses', () => {
    expect(isCouponLive({ ...BASE_COUPON, max_uses: 5, uses: 5 }, 100)).toBe(false);
  });

  it('sigue siendo válido justo por debajo de max_uses', () => {
    expect(isCouponLive({ ...BASE_COUPON, max_uses: 5, uses: 4 }, 100)).toBe(true);
  });

  it('es inválido si el subtotal no alcanza min_order', () => {
    expect(isCouponLive({ ...BASE_COUPON, min_order: 200 }, 100)).toBe(false);
  });

  it('es válido si el subtotal cumple exactamente min_order', () => {
    expect(isCouponLive({ ...BASE_COUPON, min_order: 100 }, 100)).toBe(true);
  });
});
