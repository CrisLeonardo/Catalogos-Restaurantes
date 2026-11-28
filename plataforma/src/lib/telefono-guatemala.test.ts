import { describe, expect, it } from 'vitest';
import { createOrderSchema, isValidGuatemalaPhone, problemaDeTelefono, telefonoGuatemala } from './schemas';

describe('teléfono de Guatemala (auditoría 26-nov, hallazgo 10)', () => {
  it('acepta los formatos que la gente escribe', () => {
    expect(telefonoGuatemala('5555 0000')).toBe('55550000');
    expect(telefonoGuatemala('5555-0000')).toBe('55550000');
    expect(telefonoGuatemala('+502 5555 0000')).toBe('55550000');
    expect(telefonoGuatemala('00502 2222 3344')).toBe('22223344');
    expect(telefonoGuatemala('(502) 7765-4321')).toBe('77654321');
  });

  it('rechaza números que no pueden existir', () => {
    expect(isValidGuatemalaPhone('00000000')).toBe(false);
    expect(isValidGuatemalaPhone('12345678')).toBe(false);
    expect(isValidGuatemalaPhone('99999999')).toBe(false);
    expect(isValidGuatemalaPhone('55555555')).toBe(false);
    expect(isValidGuatemalaPhone('5555000')).toBe(false);
  });

  it('explica cada caso', () => {
    expect(problemaDeTelefono('5555 0000')).toBeNull();
    expect(problemaDeTelefono('5555')).toMatch(/8 dígitos/);
    expect(problemaDeTelefono('00000000')).toMatch(/no parece real/);
    expect(problemaDeTelefono('12345678')).toMatch(/empiezan con 2/);
  });

  it('el servidor no acepta 00000000 en un pedido de la carta', () => {
    const base = {
      restaurantId: '6f1c2f57-37a4-4a9c-9a4b-0e1f6b4c2a11',
      items: [{ productId: '6f1c2f57-37a4-4a9c-9a4b-0e1f6b4c2a12', name: 'Limonada', price: 18, quantity: 1 }],
      paymentMethod: 'CASH',
    };
    const malo = createOrderSchema.safeParse({ ...base, customer: { name: 'Ana', phone: '00000000', type: 'PICKUP' } });
    expect(malo.success).toBe(false);
    const bueno = createOrderSchema.safeParse({ ...base, customer: { name: 'Ana', phone: '+502 5555-0000', type: 'PICKUP' } });
    if (bueno.success) expect(bueno.data.customer.phone).toBe('55550000');
  });
});
