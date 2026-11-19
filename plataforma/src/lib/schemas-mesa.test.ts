import { describe, expect, it } from 'vitest';
import { customerSchema } from './schemas';

// En la mesa el nombre es opcional: sin él, el pedido se llama como su mesa.
describe('customerSchema · pedido de mesa sin nombre', () => {
  it('se llama «Mesa N»', () => {
    const r = customerSchema.parse({ name: '', phone: '', type: 'DINE_IN', tableNumber: 4 });
    expect(r.name).toBe('Mesa 4');
  });

  it('conserva el nombre si lo escribió', () => {
    expect(customerSchema.parse({ name: ' Ana ', phone: '', type: 'DINE_IN', tableNumber: 4 }).name).toBe('Ana');
  });

  it('para llevar y a domicilio el nombre sigue siendo obligatorio', () => {
    expect(customerSchema.safeParse({ name: '', phone: '', type: 'PICKUP' }).success).toBe(false);
  });
});
