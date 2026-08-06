import { describe, expect, it } from 'vitest';
import {
  idempotencyId,
  toCreateOrderInput,
  externalOrderSchema,
  type ExternalOrder,
} from './channels';

/* ── Contexto ─────────────────────────────────────────────────────
   La ingesta externa recibe pedidos que YA se cobraron en otra app. Un
   error aquí no se ve como un error: se ve como una venta duplicada, o
   como un pedido que la cocina prepara con el precio equivocado. */

const base: ExternalOrder = {
  channel: 'PEDIDOSYA',
  external_id: 'PY-88421',
  items: [{ sku: 'burger-clasica', quantity: 2 }],
  customer: { name: 'Ana', phone: '55550000', type: 'DELIVERY', address: 'Zona 10' },
  delivery_fee: 15,
  payment_method: 'CASH',
};

const lines = [{ productId: 'p1', name: 'Hamburguesa', price: 56, quantity: 2 }];

describe('idempotencyId', () => {
  it('el mismo pedido externo produce siempre el mismo id', () => {
    // Es lo que evita que un middleware que reintenta —porque se le
    // perdió la respuesta, no porque haya otro pedido— le duplique la
    // venta al restaurante.
    expect(idempotencyId('PEDIDOSYA', 'PY-88421')).toBe(idempotencyId('PEDIDOSYA', 'PY-88421'));
  });

  it('pedidos distintos producen ids distintos', () => {
    expect(idempotencyId('PEDIDOSYA', 'PY-1')).not.toBe(idempotencyId('PEDIDOSYA', 'PY-2'));
  });

  it('el mismo número en canales distintos no colisiona', () => {
    // PedidosYa y Rappi numeran por su cuenta: que ambos tengan un
    // pedido "1001" es normal, y tratarlos como el mismo haría
    // desaparecer una venta real.
    expect(idempotencyId('PEDIDOSYA', '1001')).not.toBe(idempotencyId('RAPPI', '1001'));
  });

  it('tiene forma de UUID válido, que es lo que exige el esquema del pedido', () => {
    const id = idempotencyId('RAPPI', 'R-77');
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('toCreateOrderInput — precios', () => {
  it('usa el precio del catálogo, no el del canal externo', () => {
    // El payload externo ni siquiera tiene dónde poner un precio, y es a
    // propósito: si lo tuviera, una API key filtrada serviría para
    // facturarle al restaurante cualquier cifra.
    const out = toCreateOrderInput('r1', base, lines);
    expect((out.items as typeof lines)[0].price).toBe(56);
  });
});

describe('toCreateOrderInput — teléfono', () => {
  it('deja pasar un número guatemalteco de 8 dígitos', () => {
    const out = toCreateOrderInput('r1', base, lines);
    expect((out.customer as { phone: string }).phone).toBe('55550000');
  });

  it('quita el código de país cuando viene en formato internacional', () => {
    const p = { ...base, customer: { ...base.customer, phone: '+502 5555 0000' } };
    expect((toCreateOrderInput('r1', p, lines).customer as { phone: string }).phone).toBe('55550000');
  });

  it('un número irreconocible queda vacío en vez de inventado', () => {
    // Mandar basura al campo haría que el pedido se cree con un teléfono
    // falso y que nadie pueda llamar al cliente. Vacío es honesto: para
    // PICKUP es válido, y para DELIVERY createOrder lo rechaza con su
    // propio mensaje.
    const p = { ...base, customer: { ...base.customer, phone: 'no-aplica' } };
    expect((toCreateOrderInput('r1', p, lines).customer as { phone: string }).phone).toBe('');
  });

  it('sin teléfono no revienta', () => {
    const p = { ...base, customer: { ...base.customer, phone: undefined } };
    expect((toCreateOrderInput('r1', p, lines).customer as { phone: string }).phone).toBe('');
  });
});

describe('toCreateOrderInput — armado', () => {
  it('el clientId es el id idempotente del pedido externo', () => {
    const out = toCreateOrderInput('r1', base, lines);
    expect(out.clientId).toBe(idempotencyId('PEDIDOSYA', 'PY-88421'));
  });

  it('conserva la tarifa de envío y el método de pago', () => {
    const out = toCreateOrderInput('r1', base, lines);
    expect(out.deliveryFee).toBe(15);
    expect(out.paymentMethod).toBe('CASH');
  });

  it('omite dirección y notas cuando no vienen, en vez de mandarlas vacías', () => {
    const p: ExternalOrder = {
      ...base,
      customer: { name: 'Luis', type: 'PICKUP' },
    };
    const customer = toCreateOrderInput('r1', p, lines).customer as Record<string, unknown>;
    expect('address' in customer).toBe(false);
    expect('notes' in customer).toBe(false);
  });
});

describe('externalOrderSchema', () => {
  it('acepta un pedido bien formado', () => {
    expect(externalOrderSchema.safeParse(base).success).toBe(true);
  });

  it('rechaza un pedido sin ítems', () => {
    const r = externalOrderSchema.safeParse({ ...base, items: [] });
    expect(r.success).toBe(false);
  });

  it('rechaza un canal que no existe', () => {
    const r = externalOrderSchema.safeParse({ ...base, channel: 'GLOVO' });
    expect(r.success).toBe(false);
  });

  it('rechaza cantidades no enteras o negativas', () => {
    expect(externalOrderSchema.safeParse({ ...base, items: [{ sku: 'x', quantity: 1.5 }] }).success).toBe(false);
    expect(externalOrderSchema.safeParse({ ...base, items: [{ sku: 'x', quantity: -1 }] }).success).toBe(false);
  });

  it('exige external_id: sin él no hay idempotencia posible', () => {
    const { external_id: _omitido, ...sinId } = base;
    expect(externalOrderSchema.safeParse(sinId).success).toBe(false);
  });

  it('delivery_fee y payment_method tienen default', () => {
    const { delivery_fee: _f, payment_method: _p, ...sinOpcionales } = base;
    const r = externalOrderSchema.safeParse(sinOpcionales);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.delivery_fee).toBe(0);
      expect(r.data.payment_method).toBe('CASH');
    }
  });
});
